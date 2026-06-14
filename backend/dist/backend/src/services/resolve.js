"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewChallenge = reviewChallenge;
exports.finalizeChallenge = finalizeChallenge;
exports.disputeChallenge = disputeChallenge;
exports.refundChallenge = refundChallenge;
exports.resolveChallenge = resolveChallenge;
exports.sweepResolutions = sweepResolutions;
/**
 * Resolution pipeline — the bridge between Web2 social proof and Web3 settlement.
 *
 * Flow (Phase 3):
 *   active → [influencer posts final proof] → reviewChallenge() → under_review
 *          → [dispute window] → finalizeChallenge() → resolved
 *   (a contested verdict → disputed → manual finalize; a no-show → refunded)
 *
 * - reviewChallenge: run the AI Trusted Oracle on the final proof, store the
 *   verdict + a proposed outcome, and open the dispute window.
 * - finalizeChallenge: settle on-chain (if configured) and mark resolved.
 * - disputeChallenge / refundChallenge: the contested + no-show branches.
 * - sweepResolutions: the cron heartbeat that auto-finalizes past-window lines
 *   and refunds no-shows.
 * - resolveChallenge: the orchestrator behind POST /:id/resolve (advances one step).
 */
const mongoose_1 = require("mongoose");
const env_1 = require("../config/env");
const db_1 = require("../config/db");
const error_1 = require("../middleware/error");
const Challenge_1 = require("../models/Challenge");
const Photo_1 = require("../models/Photo");
const User_1 = require("../models/User");
const ai_1 = require("./ai");
const solana_1 = require("./solana");
const realtime_1 = require("../realtime");
const contract_1 = require("../contract");
const HOUR_MS = 3_600_000;
/** Read a photo's image bytes as raw base64 (inline data or GridFS). */
async function loadPhotoBase64(imageData, gridFsId) {
    if (imageData)
        return imageData;
    if (gridFsId) {
        const chunks = [];
        await new Promise((resolve, reject) => {
            (0, db_1.getBucket)()
                .openDownloadStream(gridFsId)
                .on('data', (c) => chunks.push(c))
                .on('end', () => resolve())
                .on('error', reject);
        });
        return Buffer.concat(chunks).toString('base64');
    }
    throw new error_1.HttpError(400, 'Final proof has no image data to evaluate');
}
/** The photo the oracle judges: explicit final, else the latest. */
async function loadFinalPhoto(challengeId) {
    return ((await Photo_1.PhotoModel.findOne({ challengeId, isFinal: true }).sort({ createdAt: -1 })) ??
        (await Photo_1.PhotoModel.findOne({ challengeId }).sort({ createdAt: -1 })));
}
/** Build the proof image set: a video's extracted frames, else the single photo. */
async function buildImages(finalPhoto) {
    const frames = (finalPhoto.frames ?? []);
    const isVideo = finalPhoto.mimeType.startsWith('video/');
    if (isVideo && frames.length === 0) {
        throw new error_1.HttpError(400, 'Final video has no extracted frames for the AI to evaluate.');
    }
    if (isVideo)
        return frames.map((f) => ({ base64: f, mimeType: 'image/jpeg' }));
    const base64 = await loadPhotoBase64(finalPhoto.imageData, finalPhoto.gridFsId);
    return [{ base64, mimeType: finalPhoto.mimeType }];
}
function synthManualVerdict(outcome) {
    return {
        met: outcome === 'yes',
        confidence: 1,
        reasoning: 'Manual override.',
        observedEvidence: [],
        needsManualReview: false,
    };
}
/* -------------------------------------------------------------------------- */
/* Step 1 — review: run the oracle, store the verdict, open the dispute window */
/* -------------------------------------------------------------------------- */
async function reviewChallenge(challengeId) {
    if (!mongoose_1.Types.ObjectId.isValid(challengeId))
        throw new error_1.HttpError(400, 'Invalid challenge id');
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.status === 'resolved' || challenge.status === 'refunded') {
        throw new error_1.HttpError(409, `Line already ${challenge.status}`);
    }
    const finalPhoto = await loadFinalPhoto(challengeId);
    if (!finalPhoto)
        throw new error_1.HttpError(400, 'No proof to evaluate — the influencer must post a final photo/video first');
    let verdict;
    if (env_1.env.aiEnabled) {
        try {
            const images = await buildImages(finalPhoto);
            verdict = await (0, ai_1.evaluateGoal)({
                images,
                goalText: challenge.goalText,
                successCriteria: challenge.successCriteria,
            });
        }
        catch (err) {
            // Last resort: BOTH AI oracles failed (Gemini, then the OpenAI vision
            // fallback). Rather than strand the line on `active`, advance it to manual
            // review so it's visibly pending instead of silently stuck.
            console.warn(`[resolve] both AI oracles failed; routing line ${challengeId} to manual review: ${err instanceof Error ? err.message : String(err)}`);
            verdict = {
                met: false,
                confidence: 0,
                reasoning: 'Both AI oracles were temporarily unavailable — this line needs a manual verdict.',
                observedEvidence: [],
                needsManualReview: true,
            };
        }
    }
    else {
        // No AI configured → can't auto-decide; route to manual review.
        verdict = {
            met: false,
            confidence: 0,
            reasoning: 'AI oracle not configured — needs a manual verdict.',
            observedEvidence: [],
            needsManualReview: true,
        };
    }
    const proposedOutcome = verdict.needsManualReview ? null : verdict.met ? 'yes' : 'no';
    challenge.status = 'under_review';
    challenge.set('verdict', verdict);
    challenge.proposedOutcome = proposedOutcome;
    await challenge.save();
    const deadlineReached = challenge.deadline.getTime() <= Date.now();
    (0, realtime_1.emitTicker)({
        kind: 'commentary',
        challengeId,
        challengeTitle: challenge.title,
        message: proposedOutcome
            ? deadlineReached
                ? `Verdict in: ${proposedOutcome.toUpperCase()} — settling.`
                : `Verdict in: ${proposedOutcome.toUpperCase()} — settles at the deadline.`
            : 'Final proof in — flagged for manual review.',
        at: new Date().toISOString(),
    });
    // A confident verdict settles — but only once the deadline has passed. Betting is
    // open until the deadline and the on-chain market rejects an early resolve
    // (DeadlineNotReached), so before then we hold at `under_review`; the cron sweep
    // finalizes it once the deadline hits.
    if (proposedOutcome && deadlineReached) {
        await finalizeChallenge(challengeId, proposedOutcome);
    }
    return { verdict, proposedOutcome };
}
/* -------------------------------------------------------------------------- */
/* Step 2 — finalize: settle on-chain (if configured) and mark resolved        */
/* -------------------------------------------------------------------------- */
async function finalizeChallenge(challengeId, outcome) {
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.status === 'resolved')
        throw new error_1.HttpError(409, 'Line already resolved');
    let resolveTxSig;
    // The on-chain program rejects resolve_market before the deadline
    // (DeadlineNotReached). Only attempt the on-chain settle once the deadline has
    // passed; otherwise resolve in MongoDB only (reached only via a pre-deadline
    // manual override — the normal path is gated upstream in reviewChallenge).
    const deadlineReached = challenge.deadline.getTime() <= Date.now();
    if (env_1.env.solanaEnabled && challenge.marketPda && deadlineReached) {
        try {
            const dto = (0, Challenge_1.challengeToDTO)(challenge);
            resolveTxSig = await (0, solana_1.resolveMarket)(dto, outcome);
            const market = await (0, solana_1.fetchMarket)(challenge.marketPda);
            if (market) {
                challenge.yesPoolLamports = market.yesPoolLamports;
                challenge.noPoolLamports = market.noPoolLamports;
            }
        }
        catch (err) {
            // On-chain resolution failed (e.g. account deserialisation mismatch after redeploy,
            // or market was never initialised). Degrade gracefully: MongoDB resolution still
            // proceeds so bettors can see the outcome; log for investigation.
            console.warn(`[resolve] On-chain resolve_market failed (non-fatal, MongoDB resolution continues): ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    else if (env_1.env.solanaEnabled && challenge.marketPda && !deadlineReached) {
        console.warn(`[resolve] On-chain resolve skipped for ${challengeId} — deadline not reached; MongoDB resolution only.`);
    }
    challenge.status = 'resolved';
    challenge.outcome = outcome;
    await challenge.save();
    (0, realtime_1.emitTicker)({
        kind: 'resolve',
        challengeId,
        challengeTitle: challenge.title,
        side: outcome,
        message: `Market resolved ${outcome.toUpperCase()}.`,
        at: new Date().toISOString(),
    });
    return { resolveTxSig };
}
/* -------------------------------------------------------------------------- */
/* Dispute + refund branches                                                   */
/* -------------------------------------------------------------------------- */
async function disputeChallenge(challengeId, wallet, reason) {
    if (!mongoose_1.Types.ObjectId.isValid(challengeId))
        throw new error_1.HttpError(400, 'Invalid challenge id');
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.status !== 'under_review')
        throw new error_1.HttpError(409, 'Only a line under review can be disputed');
    if (challenge.disputeWindowEndsAt && challenge.disputeWindowEndsAt.getTime() < Date.now()) {
        throw new error_1.HttpError(410, 'The dispute window has closed');
    }
    challenge.status = 'disputed';
    await challenge.save();
    (0, realtime_1.emitTicker)({
        kind: 'commentary',
        challengeId,
        challengeTitle: challenge.title,
        message: `Verdict disputed${reason ? ` — "${reason.slice(0, 80)}"` : ''}. Held for manual review.`,
        at: new Date().toISOString(),
    });
}
async function refundChallenge(challengeId, opts = {}) {
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.status === 'resolved' || challenge.status === 'refunded')
        return;
    // Refund the on-chain escrow if this line has a market (best-effort).
    if (env_1.env.solanaEnabled && challenge.marketPda) {
        try {
            await (0, solana_1.refundMarket)((0, Challenge_1.challengeToDTO)(challenge));
        }
        catch (err) {
            console.warn('[resolve] on-chain refund_market failed:', err);
        }
    }
    challenge.status = 'refunded';
    challenge.set('misses', (challenge.misses ?? 0) + (opts.noShow ? 1 : 0));
    await challenge.save();
    if (opts.noShow) {
        // Reputation penalty on the influencer for ghosting an accepted line.
        await User_1.UserModel.updateOne({ wallet: challenge.creatorWallet }, { $inc: { noShows: 1 } });
    }
    (0, realtime_1.emitTicker)({
        kind: 'commentary',
        challengeId,
        challengeTitle: challenge.title,
        message: opts.noShow
            ? 'No-show — the influencer never posted proof. Everyone refunded.'
            : 'Line refunded.',
        at: new Date().toISOString(),
    });
}
/* -------------------------------------------------------------------------- */
/* Orchestrator behind POST /:id/resolve — advances resolution by one step      */
/* -------------------------------------------------------------------------- */
async function resolveChallenge(challengeId, manualOutcome) {
    if (!mongoose_1.Types.ObjectId.isValid(challengeId))
        throw new error_1.HttpError(400, 'Invalid challenge id');
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.status === 'resolved')
        throw new error_1.HttpError(409, 'Line already resolved');
    if (challenge.status === 'refunded')
        throw new error_1.HttpError(409, 'Line was refunded');
    // Admin / manual override settles immediately with the supplied outcome.
    if (manualOutcome) {
        const { resolveTxSig } = await finalizeChallenge(challengeId, manualOutcome);
        const stored = challenge.verdict ?? synthManualVerdict(manualOutcome);
        return { verdict: stored, resolvedOutcome: manualOutcome, resolveTxSig };
    }
    // No verdict yet (active, or under_review without one) → run the oracle review.
    const storedVerdict = challenge.verdict;
    // No verdict yet → run the oracle review (which auto-settles a confident call).
    if (challenge.status === 'active' || !storedVerdict) {
        const { verdict } = await reviewChallenge(challengeId);
        const fresh = await Challenge_1.ChallengeModel.findById(challengeId);
        return { verdict, resolvedOutcome: fresh?.status === 'resolved' ? fresh.outcome : null };
    }
    // Under review with a verdict: settle if it proposed an outcome, else hold for manual.
    if (challenge.proposedOutcome) {
        const { resolveTxSig } = await finalizeChallenge(challengeId, challenge.proposedOutcome);
        return { verdict: storedVerdict, resolvedOutcome: challenge.proposedOutcome, resolveTxSig };
    }
    return { verdict: storedVerdict, resolvedOutcome: null };
}
/* -------------------------------------------------------------------------- */
/* Cron heartbeat — auto-finalize past-window lines + refund no-shows           */
/* -------------------------------------------------------------------------- */
async function sweepResolutions() {
    const now = Date.now();
    let refunded = 0;
    let settled = 0;
    // Verdict already in, but settlement was deferred until the deadline (betting is
    // open until then). Now that the deadline has passed, finalize on-chain + Mongo.
    const settleable = await Challenge_1.ChallengeModel.find({
        status: 'under_review',
        proposedOutcome: { $in: ['yes', 'no'] },
        deadline: { $lte: new Date(now) },
    }).select('_id proposedOutcome');
    for (const c of settleable) {
        try {
            await finalizeChallenge(c._id.toString(), c.proposedOutcome);
            settled++;
        }
        catch (err) {
            console.warn('[sweep] finalize failed for', c._id.toString(), err);
        }
    }
    // Accepted lines past (deadline + grace) with no final proof → refund (no-show).
    const graceCutoff = new Date(now - contract_1.PROOF_GRACE_HOURS * HOUR_MS);
    const overdue = await Challenge_1.ChallengeModel.find({ status: 'active', deadline: { $lte: graceCutoff } }).select('_id');
    for (const c of overdue) {
        const hasFinal = await Photo_1.PhotoModel.exists({ challengeId: c._id, isFinal: true });
        if (hasFinal)
            continue; // they posted; the photos hook runs resolution
        try {
            await refundChallenge(c._id.toString(), { noShow: true });
            refunded++;
        }
        catch (err) {
            console.warn('[sweep] refund failed for', c._id.toString(), err);
        }
    }
    return { refunded, settled };
}
