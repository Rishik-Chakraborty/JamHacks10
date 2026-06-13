"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveChallenge = resolveChallenge;
/**
 * Resolution orchestrator — the bridge between Web2 social proof and Web3
 * settlement. Wired lazily by the resolve route (`POST /api/challenges/:id/resolve`).
 *
 * Flow:
 *   1. Load the challenge + its final progress photo.
 *   2. Ask the AI oracle (evaluateGoal) to judge the photo vs successCriteria.
 *   3. Decide the outcome: manual override > AI verdict (unless it needs review).
 *   4. If an outcome is determined and Solana is configured, call the on-chain
 *      resolve_market with the authority signature, mirror final pools, mark the
 *      challenge resolved, and broadcast a ticker event.
 *
 * Degrades gracefully: a manual override can resolve without AI; an AI verdict
 * that needs manual review returns with resolvedOutcome = null and no on-chain write.
 */
const mongoose_1 = require("mongoose");
const env_1 = require("../config/env");
const db_1 = require("../config/db");
const error_1 = require("../middleware/error");
const Challenge_1 = require("../models/Challenge");
const Photo_1 = require("../models/Photo");
const ai_1 = require("./ai");
const solana_1 = require("./solana");
const realtime_1 = require("../realtime");
/** Read a photo's image bytes as raw base64 (inline data or GridFS). */
async function loadPhotoBase64(imageData, gridFsId) {
    if (imageData) {
        // imageData may be a data URL ("data:...;base64,xxxx") or raw base64.
        return imageData;
    }
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
    throw new error_1.HttpError(400, 'Final photo has no image data to evaluate');
}
async function resolveChallenge(challengeId, manualOutcome) {
    if (!mongoose_1.Types.ObjectId.isValid(challengeId)) {
        throw new error_1.HttpError(400, 'Invalid challenge id');
    }
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    if (challenge.status === 'resolved') {
        throw new error_1.HttpError(409, 'Challenge already resolved');
    }
    // The photo the oracle judges: the explicit final photo, else the latest one.
    const finalPhoto = (await Photo_1.PhotoModel.findOne({ challengeId, isFinal: true }).sort({ createdAt: -1 })) ??
        (await Photo_1.PhotoModel.findOne({ challengeId }).sort({ createdAt: -1 }));
    // --- 2. Obtain a verdict (AI, or synthesize one for a pure manual override) ---
    let verdict;
    if (env_1.env.aiEnabled && finalPhoto) {
        const imageBase64 = await loadPhotoBase64(finalPhoto.imageData, finalPhoto.gridFsId);
        verdict = await (0, ai_1.evaluateGoal)({
            imageBase64,
            mimeType: finalPhoto.mimeType,
            goalText: challenge.goalText,
            successCriteria: challenge.successCriteria,
        });
    }
    else if (manualOutcome) {
        // No AI (or no photo) but an admin is overriding — synthesize a manual verdict.
        verdict = {
            met: manualOutcome === 'yes',
            confidence: 1,
            reasoning: env_1.env.aiEnabled
                ? 'Manual override (no final photo available for AI evaluation).'
                : 'Manual override (AI oracle not configured).',
            observedEvidence: [],
            needsManualReview: false,
        };
    }
    else if (!finalPhoto) {
        throw new error_1.HttpError(400, 'No photo to evaluate — creator must post a final photo first');
    }
    else {
        throw new error_1.HttpError(503, 'AI oracle not configured. Provide a manualOutcome to resolve this challenge manually.');
    }
    // --- 3. Decide the outcome ---
    let resolvedOutcome;
    if (manualOutcome) {
        resolvedOutcome = manualOutcome; // admin override always wins
    }
    else if (verdict.needsManualReview) {
        resolvedOutcome = null; // hold for human — no on-chain write
    }
    else {
        resolvedOutcome = verdict.met ? 'yes' : 'no';
    }
    if (resolvedOutcome === null) {
        return { verdict, resolvedOutcome: null };
    }
    // --- 4. Settle on-chain (if configured) and persist ---
    let resolveTxSig;
    const dto = (0, Challenge_1.challengeToDTO)(challenge);
    if (env_1.env.solanaEnabled && challenge.marketPda) {
        try {
            resolveTxSig = await (0, solana_1.resolveMarket)(dto, resolvedOutcome);
            // Mirror final pool state from chain (best-effort).
            const market = await (0, solana_1.fetchMarket)(challenge.marketPda);
            if (market) {
                challenge.yesPoolLamports = market.yesPoolLamports;
                challenge.noPoolLamports = market.noPoolLamports;
            }
        }
        catch (err) {
            throw new error_1.HttpError(502, `On-chain resolve_market failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    challenge.status = 'resolved';
    challenge.outcome = resolvedOutcome;
    await challenge.save();
    (0, realtime_1.emitTicker)({
        kind: 'resolve',
        challengeId,
        challengeTitle: challenge.title,
        side: resolvedOutcome,
        message: `Market resolved ${resolvedOutcome.toUpperCase()} — ${verdict.reasoning.slice(0, 120)}`,
        at: new Date().toISOString(),
    });
    return { verdict, resolvedOutcome, resolveTxSig };
}
