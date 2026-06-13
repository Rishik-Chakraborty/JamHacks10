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
import { Types } from 'mongoose';

import { env } from '../config/env';
import { getBucket } from '../config/db';
import { HttpError } from '../middleware/error';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { PhotoModel } from '../models/Photo';
import { UserModel } from '../models/User';
import { evaluateGoal, type EvaluateImage } from './ai';
import { resolveMarket, fetchMarket } from './solana';
import { emitTicker } from '../realtime';
import { PROOF_GRACE_HOURS } from '../contract';
import type { BetSide, Outcome, OracleVerdict, ResolveChallengeResponse } from '../contract';

const HOUR_MS = 3_600_000;

/** Read a photo's image bytes as raw base64 (inline data or GridFS). */
async function loadPhotoBase64(
  imageData: string | null | undefined,
  gridFsId: Types.ObjectId | null | undefined,
): Promise<string> {
  if (imageData) return imageData;
  if (gridFsId) {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      getBucket()
        .openDownloadStream(gridFsId)
        .on('data', (c: Buffer) => chunks.push(c))
        .on('end', () => resolve())
        .on('error', reject);
    });
    return Buffer.concat(chunks).toString('base64');
  }
  throw new HttpError(400, 'Final proof has no image data to evaluate');
}

/** The photo the oracle judges: explicit final, else the latest. */
async function loadFinalPhoto(challengeId: string) {
  return (
    (await PhotoModel.findOne({ challengeId, isFinal: true }).sort({ createdAt: -1 })) ??
    (await PhotoModel.findOne({ challengeId }).sort({ createdAt: -1 }))
  );
}

/** Build the proof image set: a video's extracted frames, else the single photo. */
async function buildImages(finalPhoto: NonNullable<Awaited<ReturnType<typeof loadFinalPhoto>>>): Promise<EvaluateImage[]> {
  const frames = (finalPhoto.frames ?? []) as string[];
  const isVideo = finalPhoto.mimeType.startsWith('video/');
  if (isVideo && frames.length === 0) {
    throw new HttpError(400, 'Final video has no extracted frames for the AI to evaluate.');
  }
  if (isVideo) return frames.map((f) => ({ base64: f, mimeType: 'image/jpeg' }));
  const base64 = await loadPhotoBase64(finalPhoto.imageData, finalPhoto.gridFsId as Types.ObjectId | null);
  return [{ base64, mimeType: finalPhoto.mimeType }];
}

function synthManualVerdict(outcome: BetSide): OracleVerdict {
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
export async function reviewChallenge(challengeId: string): Promise<{ verdict: OracleVerdict; proposedOutcome: Outcome }> {
  if (!Types.ObjectId.isValid(challengeId)) throw new HttpError(400, 'Invalid challenge id');
  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Line not found');
  if (challenge.status === 'resolved' || challenge.status === 'refunded') {
    throw new HttpError(409, `Line already ${challenge.status}`);
  }

  const finalPhoto = await loadFinalPhoto(challengeId);
  if (!finalPhoto) throw new HttpError(400, 'No proof to evaluate — the influencer must post a final photo/video first');

  let verdict: OracleVerdict;
  if (env.aiEnabled) {
    const images = await buildImages(finalPhoto);
    verdict = await evaluateGoal({
      images,
      goalText: challenge.goalText,
      successCriteria: challenge.successCriteria,
    });
  } else {
    // No AI configured → can't auto-decide; route to manual review.
    verdict = {
      met: false,
      confidence: 0,
      reasoning: 'AI oracle not configured — needs a manual verdict.',
      observedEvidence: [],
      needsManualReview: true,
    };
  }

  const proposedOutcome: Outcome = verdict.needsManualReview ? null : verdict.met ? 'yes' : 'no';

  challenge.status = 'under_review';
  challenge.set('verdict', verdict);
  challenge.proposedOutcome = proposedOutcome;
  await challenge.save();

  emitTicker({
    kind: 'commentary',
    challengeId,
    challengeTitle: challenge.title,
    message: proposedOutcome
      ? `Verdict in: ${proposedOutcome.toUpperCase()} — settling.`
      : 'Final proof in — flagged for manual review.',
    at: new Date().toISOString(),
  });

  // A confident verdict settles immediately; low-confidence holds for manual review.
  if (proposedOutcome) {
    await finalizeChallenge(challengeId, proposedOutcome as BetSide);
  }

  return { verdict, proposedOutcome };
}

/* -------------------------------------------------------------------------- */
/* Step 2 — finalize: settle on-chain (if configured) and mark resolved        */
/* -------------------------------------------------------------------------- */
export async function finalizeChallenge(challengeId: string, outcome: BetSide): Promise<{ resolveTxSig?: string }> {
  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Line not found');
  if (challenge.status === 'resolved') throw new HttpError(409, 'Line already resolved');

  let resolveTxSig: string | undefined;
  if (env.solanaEnabled && challenge.marketPda) {
    try {
      const dto = challengeToDTO(challenge);
      resolveTxSig = await resolveMarket(dto, outcome);
      const market = await fetchMarket(challenge.marketPda);
      if (market) {
        challenge.yesPoolLamports = market.yesPoolLamports;
        challenge.noPoolLamports = market.noPoolLamports;
      }
    } catch (err) {
      throw new HttpError(502, `On-chain resolve_market failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  challenge.status = 'resolved';
  challenge.outcome = outcome;
  await challenge.save();

  emitTicker({
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
export async function disputeChallenge(challengeId: string, wallet: string, reason?: string): Promise<void> {
  if (!Types.ObjectId.isValid(challengeId)) throw new HttpError(400, 'Invalid challenge id');
  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Line not found');
  if (challenge.status !== 'under_review') throw new HttpError(409, 'Only a line under review can be disputed');
  if (challenge.disputeWindowEndsAt && challenge.disputeWindowEndsAt.getTime() < Date.now()) {
    throw new HttpError(410, 'The dispute window has closed');
  }

  challenge.status = 'disputed';
  await challenge.save();

  emitTicker({
    kind: 'commentary',
    challengeId,
    challengeTitle: challenge.title,
    message: `Verdict disputed${reason ? ` — "${reason.slice(0, 80)}"` : ''}. Held for manual review.`,
    at: new Date().toISOString(),
  });
}

export async function refundChallenge(challengeId: string, opts: { noShow?: boolean } = {}): Promise<void> {
  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Line not found');
  if (challenge.status === 'resolved' || challenge.status === 'refunded') return;

  challenge.status = 'refunded';
  challenge.set('misses', (challenge.misses ?? 0) + (opts.noShow ? 1 : 0));
  await challenge.save();

  if (opts.noShow) {
    // Reputation penalty on the influencer for ghosting an accepted line.
    await UserModel.updateOne({ wallet: challenge.creatorWallet }, { $inc: { noShows: 1 } });
  }

  emitTicker({
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
export async function resolveChallenge(challengeId: string, manualOutcome?: BetSide): Promise<ResolveChallengeResponse> {
  if (!Types.ObjectId.isValid(challengeId)) throw new HttpError(400, 'Invalid challenge id');
  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Line not found');
  if (challenge.status === 'resolved') throw new HttpError(409, 'Line already resolved');
  if (challenge.status === 'refunded') throw new HttpError(409, 'Line was refunded');

  // Admin / manual override settles immediately with the supplied outcome.
  if (manualOutcome) {
    const { resolveTxSig } = await finalizeChallenge(challengeId, manualOutcome);
    const stored = (challenge.verdict as OracleVerdict | undefined) ?? synthManualVerdict(manualOutcome);
    return { verdict: stored, resolvedOutcome: manualOutcome, resolveTxSig };
  }

  // No verdict yet (active, or under_review without one) → run the oracle review.
  const storedVerdict = challenge.verdict as OracleVerdict | undefined;

  // No verdict yet → run the oracle review (which auto-settles a confident call).
  if (challenge.status === 'active' || !storedVerdict) {
    const { verdict } = await reviewChallenge(challengeId);
    const fresh = await ChallengeModel.findById(challengeId);
    return { verdict, resolvedOutcome: fresh?.status === 'resolved' ? (fresh.outcome as Outcome) : null };
  }

  // Under review with a verdict: settle if it proposed an outcome, else hold for manual.
  if (challenge.proposedOutcome) {
    const { resolveTxSig } = await finalizeChallenge(challengeId, challenge.proposedOutcome as BetSide);
    return { verdict: storedVerdict, resolvedOutcome: challenge.proposedOutcome, resolveTxSig };
  }
  return { verdict: storedVerdict, resolvedOutcome: null };
}

/* -------------------------------------------------------------------------- */
/* Cron heartbeat — auto-finalize past-window lines + refund no-shows           */
/* -------------------------------------------------------------------------- */
export async function sweepResolutions(): Promise<{ refunded: number }> {
  const now = Date.now();
  let refunded = 0;

  // Accepted lines past (deadline + grace) with no final proof → refund (no-show).
  const graceCutoff = new Date(now - PROOF_GRACE_HOURS * HOUR_MS);
  const overdue = await ChallengeModel.find({ status: 'active', deadline: { $lte: graceCutoff } }).select('_id');
  for (const c of overdue) {
    const hasFinal = await PhotoModel.exists({ challengeId: c._id, isFinal: true });
    if (hasFinal) continue; // they posted; the photos hook runs resolution
    try {
      await refundChallenge(c._id.toString(), { noShow: true });
      refunded++;
    } catch (err) {
      console.warn('[sweep] refund failed for', c._id.toString(), err);
    }
  }

  return { refunded };
}
