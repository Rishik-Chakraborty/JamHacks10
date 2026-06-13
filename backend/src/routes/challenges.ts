/**
 * Challenges router.
 *  GET  /api/challenges            — list
 *  POST /api/challenges            — create
 *  GET  /api/challenges/:id        — ChallengeDetail (challenge + odds + photos + metrics + recentBets + comments)
 *  POST /api/challenges/:id/market — attach on-chain market info
 *  POST /api/challenges/:id/resolve — oracle resolution (delegates to services lazily)
 *  GET  /api/challenges/:id/odds   — parimutuel odds snapshot
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import type {
  CreateChallengeBody,
  AttachMarketBody,
  ResolveChallengeBody,
  ResolveChallengeResponse,
  ChallengeDetail,
  Odds,
  GoalReview,
  ApiError,
} from '../contract';
import { env } from '../config/env';
import { reviewGoal } from '../services/ai';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { PhotoModel, photoToDTO } from '../models/Photo';
import { MetricModel, metricToDTO } from '../models/Metric';
import { BetModel, betToDTO } from '../models/Bet';
import { CommentModel, commentToDTO } from '../models/Comment';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const challengesRouter = Router();

/**
 * Parimutuel odds from pool balances (fallback implementation mirroring the
 * formula in the shared contract `Odds`). Implied = pool / total; gross
 * multiplier = total / pool; hasMarket only once both sides have stake.
 */
export function computeOdds(yesPoolLamports: number, noPoolLamports: number): Odds {
  const totalLamports = yesPoolLamports + noPoolLamports;
  const hasMarket = yesPoolLamports > 0 && noPoolLamports > 0;
  const impliedYes = totalLamports > 0 ? yesPoolLamports / totalLamports : 0.5;
  const impliedNo = totalLamports > 0 ? noPoolLamports / totalLamports : 0.5;
  return {
    yesPoolLamports,
    noPoolLamports,
    totalLamports,
    impliedYes,
    impliedNo,
    yesMultiplier: yesPoolLamports > 0 ? totalLamports / yesPoolLamports : null,
    noMultiplier: noPoolLamports > 0 ? totalLamports / noPoolLamports : null,
    hasMarket,
  };
}

function assertObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, 'Invalid challenge id');
  return new Types.ObjectId(id);
}

const createChallengeSchema: z.ZodType<CreateChallengeBody> = z.object({
  creatorWallet: z.string().min(1),
  title: z.string().min(1),
  goalText: z.string().min(1),
  successCriteria: z.string().min(1),
  metricUnit: z.string().max(16).optional(),
  templateId: z.string().max(64).optional(),
  deadline: z.string().datetime(),
});

const attachMarketSchema: z.ZodType<AttachMarketBody> = z.object({
  marketPda: z.string().min(1),
  vaultPda: z.string().min(1),
  programId: z.string().min(1),
});

const resolveSchema: z.ZodType<ResolveChallengeBody> = z.object({
  manualOutcome: z.enum(['yes', 'no']).optional(),
});

// GET /api/challenges — newest first.
challengesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const docs = await ChallengeModel.find().sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(challengeToDTO));
  }),
);

// POST /api/challenges
// Custom goals (no templateId) are gated by the AI reviewer: a rejected goal
// returns 422 with feedback and is NOT created. Template-built goals are
// pre-approved and skip review. Fails open if the AI reviewer is unreachable.
challengesRouter.post(
  '/',
  validateBody(createChallengeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateChallengeBody;

    let successCriteria = body.successCriteria;
    const isCustom = !body.templateId;

    if (isCustom && env.aiEnabled) {
      let review: GoalReview | null = null;
      try {
        review = await reviewGoal({
          title: body.title,
          goalText: body.goalText,
          successCriteria: body.successCriteria,
        });
      } catch (err) {
        // Fail open — a flaky/misconfigured reviewer must never block creation.
        console.warn('[challenges] custom-goal review failed; allowing through:', err);
        review = null;
      }

      if (review && !review.approved) {
        const payload: ApiError & { review: GoalReview } = {
          error: review.feedback || 'This custom goal was not approved.',
          review,
        };
        res.status(422).json(payload);
        return;
      }
      // Approved → adopt the tightened criteria when the reviewer supplied one.
      if (review?.improvedCriteria) successCriteria = review.improvedCriteria;
    }

    const doc = await ChallengeModel.create({
      creatorWallet: body.creatorWallet,
      title: body.title,
      goalText: body.goalText,
      successCriteria,
      metricUnit: body.metricUnit,
      templateId: body.templateId,
      startDate: new Date(),
      deadline: new Date(body.deadline),
      status: 'active',
      outcome: null,
    });
    res.status(201).json(challengeToDTO(doc));
  }),
);

// GET /api/challenges/:id → ChallengeDetail
challengesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Challenge not found');

    const [photos, metrics, recentBets, comments] = await Promise.all([
      PhotoModel.find({ challengeId: _id }).sort({ createdAt: 1 }),
      MetricModel.find({ challengeId: _id }).sort({ ts: 1 }),
      BetModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(20),
      CommentModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(50),
    ]);

    const detail: ChallengeDetail = {
      ...challengeToDTO(challenge),
      odds: computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports),
      photos: photos.map(photoToDTO),
      metrics: metrics.map(metricToDTO),
      recentBets: recentBets.map(betToDTO),
      comments: comments.map(commentToDTO),
    };
    res.json(detail);
  }),
);

// GET /api/challenges/:id/odds
challengesRouter.get(
  '/:id/odds',
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Challenge not found');
    res.json(computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports));
  }),
);

// POST /api/challenges/:id/market — attach on-chain market references.
challengesRouter.post(
  '/:id/market',
  validateBody(attachMarketSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const body = req.body as AttachMarketBody;
    const doc = await ChallengeModel.findByIdAndUpdate(
      _id,
      { $set: { marketPda: body.marketPda, vaultPda: body.vaultPda, programId: body.programId } },
      { new: true },
    );
    if (!doc) throw new HttpError(404, 'Challenge not found');
    res.json(challengeToDTO(doc));
  }),
);

// POST /api/challenges/:id/resolve — oracle resolution.
// The AI/CV + Solana agents own the actual oracle services. We reference them
// lazily so this file typechecks standalone and degrades gracefully when the
// services are not wired yet.
challengesRouter.post(
  '/:id/resolve',
  validateBody(resolveSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const body = req.body as ResolveChallengeBody;
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Challenge not found');

    // Attempt to delegate to the oracle service if it exists at runtime.
    type Resolver = (
      challengeId: string,
      manualOutcome?: ResolveChallengeBody['manualOutcome'],
    ) => Promise<ResolveChallengeResponse>;
    let resolver: Resolver | null = null;
    try {
      // String indirection keeps this from being statically resolved at compile
      // time — the resolve service is owned by other agents and may not exist yet.
      const spec = '../services/resolve.js';
      const mod = (await import(spec)) as { resolveChallenge?: Resolver };
      resolver = mod.resolveChallenge ?? null;
    } catch {
      resolver = null;
    }

    if (resolver) {
      const result = await resolver(req.params.id, body.manualOutcome);
      res.json(result);
      return;
    }

    // Service not wired yet — return a clear, structured not-implemented note.
    res.status(501).json({
      error:
        'Resolution service not wired yet (AI oracle + Solana resolve_market are owned by other agents).',
      details: { challengeId: req.params.id, manualOutcome: body.manualOutcome ?? null },
    });
  }),
);
