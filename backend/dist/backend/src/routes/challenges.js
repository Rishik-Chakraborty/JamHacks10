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
const contract_1 = require("../contract");
const env_1 = require("../config/env");
const ai_1 = require("../services/ai");
const payouts_1 = require("../services/payouts");
const Challenge_1 = require("../models/Challenge");
const User_1 = require("../models/User");
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
    challengerWallet: zod_1.z.string().min(1),
    influencerWallet: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    goalText: zod_1.z.string().min(1),
    successCriteria: zod_1.z.string().min(1),
    metricUnit: zod_1.z.string().max(16).optional(),
    templateId: zod_1.z.string().max(64).optional(),
    deadline: zod_1.z.string().datetime(),
    seedSide: zod_1.z.enum(['yes', 'no']),
    seedAmountLamports: zod_1.z.number().int().positive(),
});
const acceptLineSchema = zod_1.z.object({ influencerWallet: zod_1.z.string().min(1) });
const declineLineSchema = zod_1.z.object({ influencerWallet: zod_1.z.string().min(1) });
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
// Custom goals (no templateId) are gated by the AI reviewer: a rejected goal
// returns 422 with feedback and is NOT created. Template-built goals are
// pre-approved and skip review. Fails open if the AI reviewer is unreachable.
exports.challengesRouter.post('/', (0, validate_1.validateBody)(createChallengeSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    if (body.challengerWallet === body.influencerWallet) {
        throw new error_1.HttpError(400, "You can't challenge yourself — pick an influencer to challenge.");
    }
    let successCriteria = body.successCriteria;
    const isCustom = !body.templateId;
    // reviewGoal() uses the OpenAI commentary model, so gate on that key — not the
    // Gemini vision key (aiEnabled), which is for the photo oracle.
    if (isCustom && env_1.env.commentaryEnabled) {
        let review = null;
        try {
            review = await (0, ai_1.reviewGoal)({
                title: body.title,
                goalText: body.goalText,
                successCriteria: body.successCriteria,
            });
        }
        catch (err) {
            // Fail open — a flaky/misconfigured reviewer must never block creation.
            console.warn('[challenges] custom-goal review failed; allowing through:', err);
            review = null;
        }
        if (review && !review.approved) {
            const payload = {
                error: review.feedback || 'This custom goal was not approved.',
                review,
            };
            res.status(422).json(payload);
            return;
        }
        // Approved → adopt the tightened criteria when the reviewer supplied one.
        if (review?.improvedCriteria)
            successCriteria = review.improvedCriteria;
    }
    const deadline = new Date(body.deadline);
    const now = new Date();
    // Betting stays open until the deadline itself (no early lock window).
    const betLockAt = deadline;
    const acceptDeadline = new Date(now.getTime() + contract_1.ACCEPT_WINDOW_HOURS * 3_600_000);
    if (deadline.getTime() <= now.getTime()) {
        throw new error_1.HttpError(400, 'Deadline must be in the future.');
    }
    const seedYes = body.seedSide === 'yes' ? body.seedAmountLamports : 0;
    const seedNo = body.seedSide === 'no' ? body.seedAmountLamports : 0;
    const total = seedYes + seedNo;
    const doc = await Challenge_1.ChallengeModel.create({
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
        creatorFeeBps: contract_1.DEFAULT_CREATOR_FEE_BPS,
        platformFeeBps: contract_1.DEFAULT_PLATFORM_FEE_BPS,
        outcome: null,
        yesPoolLamports: seedYes,
        noPoolLamports: seedNo,
        impliedYes: total > 0 ? seedYes / total : 0.5,
        hypeScore: 1,
    });
    // Record the challenger's seed bet (web2 mirror — the on-chain seed lands with
    // the Anchor redeploy). The synthetic tx id satisfies the unique txSig index.
    await Bet_1.BetModel.create({
        challengeId: doc._id,
        bettorWallet: body.challengerWallet,
        side: body.seedSide,
        amountLamports: body.seedAmountLamports,
        txSig: `seed_${doc._id.toString()}`,
        positionPda: `seedpos_${doc._id.toString()}`,
        claimed: false,
    });
    res.status(201).json((0, Challenge_1.challengeToDTO)(doc));
}));
// POST /api/challenges/:id/accept — the challenged influencer accepts; line opens for betting.
exports.challengesRouter.post('/:id/accept', (0, validate_1.validateBody)(acceptLineSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const { influencerWallet } = req.body;
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.creatorWallet !== influencerWallet) {
        throw new error_1.HttpError(403, 'Only the challenged influencer can accept this line');
    }
    if (challenge.status !== 'pending_accept') {
        throw new error_1.HttpError(409, `Line is not awaiting acceptance (status: ${challenge.status})`);
    }
    if (challenge.acceptDeadline && challenge.acceptDeadline.getTime() < Date.now()) {
        challenge.status = 'refunded';
        await challenge.save();
        throw new error_1.HttpError(410, 'The accept window has passed — this line was refunded');
    }
    challenge.status = 'active';
    await challenge.save();
    // Accepting a line opts the influencer into creator mode.
    await User_1.UserModel.updateOne({ wallet: influencerWallet }, { $set: { isCreator: true } });
    res.json((0, Challenge_1.challengeToDTO)(challenge));
}));
// POST /api/challenges/:id/decline — the influencer declines; line refunds.
exports.challengesRouter.post('/:id/decline', (0, validate_1.validateBody)(declineLineSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const { influencerWallet } = req.body;
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    if (challenge.creatorWallet !== influencerWallet) {
        throw new error_1.HttpError(403, 'Only the challenged influencer can decline this line');
    }
    if (challenge.status !== 'pending_accept') {
        throw new error_1.HttpError(409, `Line is not awaiting acceptance (status: ${challenge.status})`);
    }
    challenge.status = 'refunded';
    await challenge.save();
    res.json((0, Challenge_1.challengeToDTO)(challenge));
}));
// GET /api/challenges/:id?viewer=<wallet> → ChallengeDetail
exports.challengesRouter.get('/:id', (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const viewer = typeof req.query.viewer === 'string' ? req.query.viewer : undefined;
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    const [photos, metrics, recentBets, comments] = await Promise.all([
        Photo_1.PhotoModel.find({ challengeId: _id }).sort({ createdAt: 1 }),
        Metric_1.MetricModel.find({ challengeId: _id }).sort({ ts: 1 }),
        Bet_1.BetModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(20),
        Comment_1.CommentModel.find({ challengeId: _id }).sort({ createdAt: -1 }).limit(50),
    ]);
    const dto = (0, Challenge_1.challengeToDTO)(challenge);
    dto.likedByMe = viewer ? (challenge.likes ?? []).includes(viewer) : false;
    const detail = {
        ...dto,
        odds: computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports),
        photos: photos.map(Photo_1.photoToDTO),
        metrics: metrics.map(Metric_1.metricToDTO),
        recentBets: recentBets.map(Bet_1.betToDTO),
        comments: comments.map(Comment_1.commentToDTO),
        settlement: (0, payouts_1.computeSettlement)(dto) ?? undefined,
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
// POST /api/challenges/:id/like — toggle the requesting wallet's like on a line.
const likeLineSchema = zod_1.z.object({ wallet: zod_1.z.string().min(1) });
exports.challengesRouter.post('/:id/like', (0, validate_1.validateBody)(likeLineSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const _id = assertObjectId(req.params.id);
    const { wallet } = req.body;
    const challenge = await Challenge_1.ChallengeModel.findById(_id);
    if (!challenge)
        throw new error_1.HttpError(404, 'Line not found');
    const likes = (challenge.likes ?? []);
    const liked = likes.includes(wallet);
    challenge.set('likes', liked ? likes.filter((w) => w !== wallet) : [...likes, wallet]);
    await challenge.save();
    res.json({ ...(0, Challenge_1.challengeToDTO)(challenge), likedByMe: !liked });
}));
