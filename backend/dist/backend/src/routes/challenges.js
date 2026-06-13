"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.challengesRouter = void 0;
exports.computeOdds = computeOdds;
/**
 * Challenges router.
 *  GET  /api/challenges            — list
 *  POST /api/challenges            — create
 *  GET  /api/challenges/:id        — ChallengeDetail (challenge + odds + photos + metrics + recentBets + comments)
 *  POST /api/challenges/:id/market — attach on-chain market info
 *  POST /api/challenges/:id/resolve — oracle resolution (delegates to services lazily)
 *  GET  /api/challenges/:id/odds   — parimutuel odds snapshot
 */
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const zod_1 = require("zod");
const Challenge_1 = require("../models/Challenge");
const Photo_1 = require("../models/Photo");
const Metric_1 = require("../models/Metric");
const Bet_1 = require("../models/Bet");
const Comment_1 = require("../models/Comment");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.challengesRouter = (0, express_1.Router)();
/**
 * Parimutuel odds from pool balances (fallback implementation mirroring the
 * formula in the shared contract `Odds`). Implied = pool / total; gross
 * multiplier = total / pool; hasMarket only once both sides have stake.
 */
function computeOdds(yesPoolLamports, noPoolLamports) {
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
function assertObjectId(id) {
    if (!mongoose_1.Types.ObjectId.isValid(id))
        throw new error_1.HttpError(400, 'Invalid challenge id');
    return new mongoose_1.Types.ObjectId(id);
}
const createChallengeSchema = zod_1.z.object({
    creatorWallet: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    goalText: zod_1.z.string().min(1),
    successCriteria: zod_1.z.string().min(1),
    metricType: zod_1.z.enum(['weight', 'bench', 'visual']),
    deadline: zod_1.z.string().datetime(),
});
const attachMarketSchema = zod_1.z.object({
    marketPda: zod_1.z.string().min(1),
    vaultPda: zod_1.z.string().min(1),
    programId: zod_1.z.string().min(1),
});
const resolveSchema = zod_1.z.object({
    manualOutcome: zod_1.z.enum(['yes', 'no']).optional(),
});
// GET /api/challenges — newest first.
exports.challengesRouter.get('/', (0, validate_1.asyncHandler)(async (_req, res) => {
    const docs = await Challenge_1.ChallengeModel.find().sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(Challenge_1.challengeToDTO));
}));
// POST /api/challenges
exports.challengesRouter.post('/', (0, validate_1.validateBody)(createChallengeSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    const doc = await Challenge_1.ChallengeModel.create({
        creatorWallet: body.creatorWallet,
        title: body.title,
        goalText: body.goalText,
        successCriteria: body.successCriteria,
        metricType: body.metricType,
        startDate: new Date(),
        deadline: new Date(body.deadline),
        status: 'active',
        outcome: null,
    });
    res.status(201).json((0, Challenge_1.challengeToDTO)(doc));
}));
// GET /api/challenges/:id → ChallengeDetail
exports.challengesRouter.get('/:id', (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    const [photos, metrics, recentBets, comments] = await Promise.all([
        Photo_1.PhotoModel.find({ challengeId: _id }).sort({ createdAt: 1 }),
        Metric_1.MetricModel.find({ challengeId: _id }).sort({ ts: 1 }),
        Bet_1.BetModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(20),
        Comment_1.CommentModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(50),
    ]);
    const detail = {
        ...(0, Challenge_1.challengeToDTO)(challenge),
        odds: computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports),
        photos: photos.map(Photo_1.photoToDTO),
        metrics: metrics.map(Metric_1.metricToDTO),
        recentBets: recentBets.map(Bet_1.betToDTO),
        comments: comments.map(Comment_1.commentToDTO),
    };
    res.json(detail);
}));
// GET /api/challenges/:id/odds
exports.challengesRouter.get('/:id/odds', (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    res.json(computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports));
}));
// POST /api/challenges/:id/market — attach on-chain market references.
exports.challengesRouter.post('/:id/market', (0, validate_1.validateBody)(attachMarketSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const body = req.body;
    const doc = await Challenge_1.ChallengeModel.findByIdAndUpdate(_id, { $set: { marketPda: body.marketPda, vaultPda: body.vaultPda, programId: body.programId } }, { new: true });
    if (!doc)
        throw new error_1.HttpError(404, 'Challenge not found');
    res.json((0, Challenge_1.challengeToDTO)(doc));
}));
// POST /api/challenges/:id/resolve — oracle resolution.
// The AI/CV + Solana agents own the actual oracle services. We reference them
// lazily so this file typechecks standalone and degrades gracefully when the
// services are not wired yet.
exports.challengesRouter.post('/:id/resolve', (0, validate_1.validateBody)(resolveSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const body = req.body;
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    let resolver = null;
    try {
        // String indirection keeps this from being statically resolved at compile
        // time — the resolve service is owned by other agents and may not exist yet.
        const spec = '../services/resolve.js';
        const mod = (await import(spec));
        resolver = mod.resolveChallenge ?? null;
    }
    catch {
        resolver = null;
    }
    if (resolver) {
        const result = await resolver(req.params.id, body.manualOutcome);
        res.json(result);
        return;
    }
    // Service not wired yet — return a clear, structured not-implemented note.
    res.status(501).json({
        error: 'Resolution service not wired yet (AI oracle + Solana resolve_market are owned by other agents).',
        details: { challengeId: req.params.id, manualOutcome: body.manualOutcome ?? null },
    });
}));
