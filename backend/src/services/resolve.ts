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
import { Types } from 'mongoose';

import { env } from '../config/env';
import { getBucket } from '../config/db';
import { HttpError } from '../middleware/error';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { PhotoModel } from '../models/Photo';
import { evaluateGoal } from './ai';
import { resolveMarket, fetchMarket } from './solana';
import { emitTicker } from '../realtime';
import type { BetSide, OracleVerdict, ResolveChallengeResponse } from '../contract';

/** Read a photo's image bytes as raw base64 (inline data or GridFS). */
async function loadPhotoBase64(imageData: string | null | undefined, gridFsId: Types.ObjectId | null | undefined): Promise<string> {
  if (imageData) {
    // imageData may be a data URL ("data:...;base64,xxxx") or raw base64.
    return imageData;
  }
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
  throw new HttpError(400, 'Final photo has no image data to evaluate');
}

export async function resolveChallenge(
  challengeId: string,
  manualOutcome?: BetSide,
): Promise<ResolveChallengeResponse> {
  if (!Types.ObjectId.isValid(challengeId)) {
    throw new HttpError(400, 'Invalid challenge id');
  }

  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Challenge not found');
  if (challenge.status === 'resolved') {
    throw new HttpError(409, 'Challenge already resolved');
  }

  // The photo the oracle judges: the explicit final photo, else the latest one.
  const finalPhoto =
    (await PhotoModel.findOne({ challengeId, isFinal: true }).sort({ createdAt: -1 })) ??
    (await PhotoModel.findOne({ challengeId }).sort({ createdAt: -1 }));

  // --- 2. Obtain a verdict (AI, or synthesize one for a pure manual override) ---
  let verdict: OracleVerdict;

  if (env.aiEnabled && finalPhoto) {
    // A video is judged from its extracted still frames; a photo from itself.
    const frames = (finalPhoto.frames ?? []) as string[];
    const isVideo = finalPhoto.mimeType.startsWith('video/');
    if (isVideo && frames.length === 0) {
      throw new HttpError(400, 'Final video has no extracted frames for the AI to evaluate.');
    }
    const images =
      isVideo && frames.length > 0
        ? frames.map((f) => ({ base64: f, mimeType: 'image/jpeg' }))
        : [
            {
              base64: await loadPhotoBase64(
                finalPhoto.imageData,
                finalPhoto.gridFsId as Types.ObjectId | null,
              ),
              mimeType: finalPhoto.mimeType,
            },
          ];
    verdict = await evaluateGoal({
      images,
      goalText: challenge.goalText,
      successCriteria: challenge.successCriteria,
    });
  } else if (manualOutcome) {
    // No AI (or no photo) but an admin is overriding — synthesize a manual verdict.
    verdict = {
      met: manualOutcome === 'yes',
      confidence: 1,
      reasoning: env.aiEnabled
        ? 'Manual override (no final photo available for AI evaluation).'
        : 'Manual override (AI oracle not configured).',
      observedEvidence: [],
      needsManualReview: false,
    };
  } else if (!finalPhoto) {
    throw new HttpError(400, 'No photo to evaluate — creator must post a final photo first');
  } else {
    throw new HttpError(
      503,
      'AI oracle not configured. Provide a manualOutcome to resolve this challenge manually.',
    );
  }

  // --- 3. Decide the outcome ---
  let resolvedOutcome: BetSide | null;
  if (manualOutcome) {
    resolvedOutcome = manualOutcome; // admin override always wins
  } else if (verdict.needsManualReview) {
    resolvedOutcome = null; // hold for human — no on-chain write
  } else {
    resolvedOutcome = verdict.met ? 'yes' : 'no';
  }

  if (resolvedOutcome === null) {
    return { verdict, resolvedOutcome: null };
  }

  // --- 4. Settle on-chain (if configured) and persist ---
  let resolveTxSig: string | undefined;
  const dto = challengeToDTO(challenge);

  if (env.solanaEnabled && challenge.marketPda) {
    try {
      resolveTxSig = await resolveMarket(dto, resolvedOutcome);
      // Mirror final pool state from chain (best-effort).
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
  challenge.outcome = resolvedOutcome;
  await challenge.save();

  emitTicker({
    kind: 'resolve',
    challengeId,
    challengeTitle: challenge.title,
    side: resolvedOutcome,
    message: `Market resolved ${resolvedOutcome.toUpperCase()} — ${verdict.reasoning.slice(0, 120)}`,
    at: new Date().toISOString(),
  });

  return { verdict, resolvedOutcome, resolveTxSig };
}
