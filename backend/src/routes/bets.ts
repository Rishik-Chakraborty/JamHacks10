/**
 * Bets router — the on-chain mirror.
 *  POST /api/bets                 — idempotent upsert on txSig; bumps parent pools + impliedYes
 *  GET  /api/challenges/:id/bets   — list by challenge (mounted from challenges path)
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import type { CreateBetBody, PortfolioPosition } from '../contract';
import { BetModel, betToDTO } from '../models/Bet';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { computeBetPayout } from '../services/payouts';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const betsRouter = Router();
/** Mounted under /api/challenges for the per-challenge bet list route. */
export const challengeBetsRouter = Router({ mergeParams: true });
/** Mounted under /api/users for a bettor's cross-market positions. */
export const userPositionsRouter = Router({ mergeParams: true });

const createBetSchema: z.ZodType<CreateBetBody> = z.object({
  challengeId: z.string().min(1),
  bettorWallet: z.string().min(1),
  side: z.enum(['yes', 'no']),
  amountLamports: z.number().int().positive(),
  txSig: z.string().min(1),
  positionPda: z.string().min(1),
});

function assertObjectId(id: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, `Invalid ${label} id`);
  return new Types.ObjectId(id);
}

// POST /api/bets — idempotent on txSig.
betsRouter.post(
  '/',
  validateBody(createBetSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBetBody;
    const challengeId = assertObjectId(body.challengeId, 'challenge');

    const challenge = await ChallengeModel.findById(challengeId);
    if (!challenge) throw new HttpError(404, 'Challenge not found');

    // --- Line-integrity guards (defense-in-depth; UI enforces these too) ------
    if (challenge.status !== 'active') {
      const msg =
        challenge.status === 'pending_accept'
          ? "This line is still awaiting the influencer's acceptance"
          : challenge.status === 'refunded'
            ? 'This line was refunded'
            : 'Betting is closed for this line';
      throw new HttpError(409, msg);
    }
    if (body.bettorWallet === challenge.creatorWallet) {
      throw new HttpError(403, "The influencer can't bet on their own line");
    }
    if (challenge.betLockAt && Date.now() >= challenge.betLockAt.getTime()) {
      throw new HttpError(409, 'Betting is locked — within the final window before the deadline');
    }

    // Was this tx already mirrored? Idempotency guard before mutating pools.
    const existing = await BetModel.findOne({ txSig: body.txSig });
    if (existing) {
      res.status(200).json(betToDTO(existing));
      return;
    }

    let doc;
    try {
      doc = await BetModel.create({
        challengeId,
        bettorWallet: body.bettorWallet,
        side: body.side,
        amountLamports: body.amountLamports,
        txSig: body.txSig,
        positionPda: body.positionPda,
        claimed: false,
      });
    } catch (err: unknown) {
      // Concurrent duplicate on the unique txSig index — return the winner.
      if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
        const winner = await BetModel.findOne({ txSig: body.txSig });
        if (winner) {
          res.status(200).json(betToDTO(winner));
          return;
        }
      }
      throw err;
    }

    // Bump the parent challenge's mirrored pool + recompute implied YES.
    const poolField = body.side === 'yes' ? 'yesPoolLamports' : 'noPoolLamports';
    const updated = await ChallengeModel.findByIdAndUpdate(
      challengeId,
      { $inc: { [poolField]: body.amountLamports, hypeScore: 2 } },
      { new: true },
    );
    if (updated) {
      const total = updated.yesPoolLamports + updated.noPoolLamports;
      updated.impliedYes = total > 0 ? updated.yesPoolLamports / total : 0.5;
      await updated.save();
    }

    res.status(201).json(betToDTO(doc));
  }),
);

// GET /api/challenges/:id/bets
challengeBetsRouter.get(
  '/:id/bets',
  asyncHandler(async (req, res) => {
    const challengeId = assertObjectId(req.params.id, 'challenge');
    const docs = await BetModel.find({ challengeId }).sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(betToDTO));
  }),
);

// GET /api/users/:wallet/positions — every bet a wallet holds, joined with its market.
userPositionsRouter.get(
  '/:wallet/positions',
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;
    const bets = await BetModel.find({ bettorWallet: wallet }).sort({ createdAt: -1 }).limit(300);

    // Batch-load the challenges these bets reference.
    const challengeIds = [...new Set(bets.map((b) => b.challengeId.toString()))];
    const challenges = await ChallengeModel.find({ _id: { $in: challengeIds } });
    const byId = new Map(challenges.map((c) => [c._id.toString(), c]));

    const positions: PortfolioPosition[] = [];
    for (const bet of bets) {
      const challenge = byId.get(bet.challengeId.toString());
      if (!challenge) continue;
      const cDto = challengeToDTO(challenge);
      const bDto = betToDTO(bet);
      const payout = computeBetPayout(cDto, bDto);
      positions.push({
        bet: bDto,
        challenge: cDto,
        payoutLamports: payout?.payoutLamports,
        won: payout?.won,
        refunded: payout?.refunded,
      });
    }
    res.json(positions);
  }),
);
