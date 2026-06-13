/**
 * Bets router — the on-chain mirror.
 *  POST /api/bets                 — idempotent upsert on txSig; bumps parent pools + impliedYes
 *  GET  /api/challenges/:id/bets   — list by challenge (mounted from challenges path)
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import type { CreateBetBody } from '../contract';
import { BetModel, betToDTO } from '../models/Bet';
import { ChallengeModel } from '../models/Challenge';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const betsRouter = Router();
/** Mounted under /api/challenges for the per-challenge bet list route. */
export const challengeBetsRouter = Router({ mergeParams: true });

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
