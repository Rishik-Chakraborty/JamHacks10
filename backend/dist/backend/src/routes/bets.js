"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.challengeBetsRouter = exports.betsRouter = void 0;
/**
 * Bets router — the on-chain mirror.
 *  POST /api/bets                 — idempotent upsert on txSig; bumps parent pools + impliedYes
 *  GET  /api/challenges/:id/bets   — list by challenge (mounted from challenges path)
 */
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const zod_1 = require("zod");
const Bet_1 = require("../models/Bet");
const Challenge_1 = require("../models/Challenge");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.betsRouter = (0, express_1.Router)();
/** Mounted under /api/challenges for the per-challenge bet list route. */
exports.challengeBetsRouter = (0, express_1.Router)({ mergeParams: true });
const createBetSchema = zod_1.z.object({
    challengeId: zod_1.z.string().min(1),
    bettorWallet: zod_1.z.string().min(1),
    side: zod_1.z.enum(['yes', 'no']),
    amountLamports: zod_1.z.number().int().positive(),
    txSig: zod_1.z.string().min(1),
    positionPda: zod_1.z.string().min(1),
});
function assertObjectId(id, label) {
    if (!mongoose_1.Types.ObjectId.isValid(id))
        throw new error_1.HttpError(400, `Invalid ${label} id`);
    return new mongoose_1.Types.ObjectId(id);
}
// POST /api/bets — idempotent on txSig.
exports.betsRouter.post('/', (0, validate_1.validateBody)(createBetSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    const challengeId = assertObjectId(body.challengeId, 'challenge');
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    // Was this tx already mirrored? Idempotency guard before mutating pools.
    const existing = await Bet_1.BetModel.findOne({ txSig: body.txSig });
    if (existing) {
        res.status(200).json((0, Bet_1.betToDTO)(existing));
        return;
    }
    let doc;
    try {
        doc = await Bet_1.BetModel.create({
            challengeId,
            bettorWallet: body.bettorWallet,
            side: body.side,
            amountLamports: body.amountLamports,
            txSig: body.txSig,
            positionPda: body.positionPda,
            claimed: false,
        });
    }
    catch (err) {
        // Concurrent duplicate on the unique txSig index — return the winner.
        if (typeof err === 'object' && err !== null && err.code === 11000) {
            const winner = await Bet_1.BetModel.findOne({ txSig: body.txSig });
            if (winner) {
                res.status(200).json((0, Bet_1.betToDTO)(winner));
                return;
            }
        }
        throw err;
    }
    // Bump the parent challenge's mirrored pool + recompute implied YES.
    const poolField = body.side === 'yes' ? 'yesPoolLamports' : 'noPoolLamports';
    const updated = await Challenge_1.ChallengeModel.findByIdAndUpdate(challengeId, { $inc: { [poolField]: body.amountLamports, hypeScore: 2 } }, { new: true });
    if (updated) {
        const total = updated.yesPoolLamports + updated.noPoolLamports;
        updated.impliedYes = total > 0 ? updated.yesPoolLamports / total : 0.5;
        await updated.save();
    }
    res.status(201).json((0, Bet_1.betToDTO)(doc));
}));
// GET /api/challenges/:id/bets
exports.challengeBetsRouter.get('/:id/bets', (0, validate_1.asyncHandler)(async (req, res) => {
    const challengeId = assertObjectId(req.params.id, 'challenge');
    const docs = await Bet_1.BetModel.find({ challengeId }).sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(Bet_1.betToDTO));
}));
