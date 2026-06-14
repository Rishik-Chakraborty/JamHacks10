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
  AcceptLineBody,
  DeclineLineBody,
  AttachMarketBody,
  ResolveChallengeBody,
  ResolveChallengeResponse,
  ChallengeDetail,
  Odds,
  GoalReview,
  ApiError,
} from '../contract';
import {
  ACCEPT_WINDOW_HOURS,
  DEFAULT_CREATOR_FEE_BPS,
  DEFAULT_PLATFORM_FEE_BPS,
} from '../contract';
import { env } from '../config/env';
import { reviewGoal } from '../services/ai';
import { computeSettlement } from '../services/payouts';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { UserModel } from '../models/User';
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
  challengerWallet: z.string().min(1),
  influencerWallet: z.string().min(1),
  title: z.string().min(1),
  goalText: z.string().min(1),
  successCriteria: z.string().min(1),
  metricUnit: z.string().max(16).optional(),
  templateId: z.string().max(64).optional(),
  deadline: z.string().datetime(),
  seedSide: z.enum(['yes', 'no']),
  seedAmountLamports: z.number().int().positive(),
});

const acceptLineSchema: z.ZodType<AcceptLineBody> = z.object({ influencerWallet: z.string().min(1) });
const declineLineSchema: z.ZodType<DeclineLineBody> = z.object({ influencerWallet: z.string().min(1) });

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

    if (body.challengerWallet === body.influencerWallet) {
      throw new HttpError(400, "You can't challenge yourself — pick an influencer to challenge.");
    }

    let successCriteria = body.successCriteria;
    const isCustom = !body.templateId;

    // reviewGoal() uses the OpenAI commentary model, so gate on that key — not the
    // Gemini vision key (aiEnabled), which is for the photo oracle.
    if (isCustom && env.commentaryEnabled) {
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

    const deadline = new Date(body.deadline);
    const now = new Date();
    // Betting stays open until the deadline itself (no early lock window).
    const betLockAt = deadline;
    const acceptDeadline = new Date(now.getTime() + ACCEPT_WINDOW_HOURS * 3_600_000);

    if (deadline.getTime() <= now.getTime()) {
      throw new HttpError(400, 'Deadline must be in the future.');
    }

    const seedYes = body.seedSide === 'yes' ? body.seedAmountLamports : 0;
    const seedNo = body.seedSide === 'no' ? body.seedAmountLamports : 0;
    const total = seedYes + seedNo;

    const doc = await ChallengeModel.create({
      creatorWallet: body.influencerWallet, // the influencer is the subject of the line
      challengerWallet: body.challengerWallet,
      title: body.title,
      goalText: body.goalText,
      successCriteria,
      metricUnit: body.metricUnit,
      templateId: body.templateId,
      startDate: now,
      deadline,
      status: 'pending_accept',
      acceptDeadline,
      betLockAt,
      creatorFeeBps: DEFAULT_CREATOR_FEE_BPS,
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      outcome: null,
      yesPoolLamports: seedYes,
      noPoolLamports: seedNo,
      impliedYes: total > 0 ? seedYes / total : 0.5,
      hypeScore: 1,
    });

    // Record the challenger's seed bet (web2 mirror — the on-chain seed lands with
    // the Anchor redeploy). The synthetic tx id satisfies the unique txSig index.
    await BetModel.create({
      challengeId: doc._id,
      bettorWallet: body.challengerWallet,
      side: body.seedSide,
      amountLamports: body.seedAmountLamports,
      txSig: `seed_${doc._id.toString()}`,
      positionPda: `seedpos_${doc._id.toString()}`,
      claimed: false,
    });

    res.status(201).json(challengeToDTO(doc));
  }),
);

// POST /api/challenges/:id/accept — the challenged influencer accepts; line opens for betting.
challengesRouter.post(
  '/:id/accept',
  validateBody(acceptLineSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const { influencerWallet } = req.body as AcceptLineBody;
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Line not found');
    if (challenge.creatorWallet !== influencerWallet) {
      throw new HttpError(403, 'Only the challenged influencer can accept this line');
    }
    if (challenge.status !== 'pending_accept') {
      throw new HttpError(409, `Line is not awaiting acceptance (status: ${challenge.status})`);
    }
    if (challenge.acceptDeadline && challenge.acceptDeadline.getTime() < Date.now()) {
      challenge.status = 'refunded';
      await challenge.save();
      throw new HttpError(410, 'The accept window has passed — this line was refunded');
    }

    challenge.status = 'active';
    await challenge.save();
    // Accepting a line opts the influencer into creator mode.
    await UserModel.updateOne({ wallet: influencerWallet }, { $set: { isCreator: true } });

    res.json(challengeToDTO(challenge));
  }),
);

// POST /api/challenges/:id/decline — the influencer declines; line refunds.
challengesRouter.post(
  '/:id/decline',
  validateBody(declineLineSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const { influencerWallet } = req.body as DeclineLineBody;
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Line not found');
    if (challenge.creatorWallet !== influencerWallet) {
      throw new HttpError(403, 'Only the challenged influencer can decline this line');
    }
    if (challenge.status !== 'pending_accept') {
      throw new HttpError(409, `Line is not awaiting acceptance (status: ${challenge.status})`);
    }

    challenge.status = 'refunded';
    await challenge.save();
    res.json(challengeToDTO(challenge));
  }),
);

// GET /api/challenges/:id?viewer=<wallet> → ChallengeDetail
challengesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const viewer = typeof req.query.viewer === 'string' ? req.query.viewer : undefined;
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Challenge not found');

    const [photos, metrics, recentBets, comments] = await Promise.all([
      PhotoModel.find({ challengeId: _id }).sort({ createdAt: 1 }),
      MetricModel.find({ challengeId: _id }).sort({ ts: 1 }),
      BetModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(20),
      CommentModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(50),
    ]);

    const dto = challengeToDTO(challenge);
    dto.likedByMe = viewer ? (challenge.likes ?? []).includes(viewer) : false;
    const detail: ChallengeDetail = {
      ...dto,
      odds: computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports),
      photos: photos.map(photoToDTO),
      metrics: metrics.map(metricToDTO),
      recentBets: recentBets.map(betToDTO),
      comments: comments.map(commentToDTO),
      settlement: computeSettlement(dto) ?? undefined,
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

// POST /api/challenges/:id/like — toggle the requesting wallet's like on a line.
const likeLineSchema = z.object({ wallet: z.string().min(1) });
challengesRouter.post(
  '/:id/like',
  validateBody(likeLineSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const { wallet } = req.body as z.infer<typeof likeLineSchema>;
    const challenge = await ChallengeModel.findById(_id);
    if (!challenge) throw new HttpError(404, 'Line not found');

    const likes = (challenge.likes ?? []) as string[];
    const liked = likes.includes(wallet);
    challenge.set('likes', liked ? likes.filter((w) => w !== wallet) : [...likes, wallet]);
    await challenge.save();

    res.json({ ...challengeToDTO(challenge), likedByMe: !liked });
  }),
);

