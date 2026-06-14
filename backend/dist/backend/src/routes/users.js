"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
exports.enrichUser = enrichUser;
/**
 * Users router — create (upsert by wallet) + fetch by wallet.
 *  POST /api/users
 *  GET  /api/users/:wallet
 */
const express_1 = require("express");
const zod_1 = require("zod");
const contract_1 = require("../contract");
const User_1 = require("../models/User");
const Follow_1 = require("../models/Follow");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.usersRouter = (0, express_1.Router)();
/**
 * Enrich a base User DTO with social-graph counts and creator-program status.
 * Exported so the profile route can reuse it.
 */
async function enrichUser(doc) {
    const base = (0, User_1.userToDTO)(doc);
    const { followerCount, followingCount } = await (0, Follow_1.followCounts)(base.wallet);
    return {
        ...base,
        followerCount,
        followingCount,
        creatorProgram: followerCount >= contract_1.CREATOR_PROGRAM_FOLLOWER_THRESHOLD,
    };
}
/** Usernames: 3–20 chars, letters / numbers / underscores. Unique (case-insensitive). */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const usernameField = zod_1.z
    .string()
    .trim()
    .regex(USERNAME_RE, 'Username must be 3–20 letters, numbers, or underscores.');
/** Case-insensitive collation so lookups match the unique index on `username`. */
const CI = { locale: 'en', strength: 2 };
/** Is `username` already taken by a wallet other than `selfWallet`? */
async function usernameTaken(username, selfWallet) {
    const filter = { username };
    if (selfWallet)
        filter.wallet = { $ne: selfWallet };
    const existing = await User_1.UserModel.findOne(filter).collation(CI);
    return existing !== null;
}
const createUserSchema = zod_1.z.object({
    wallet: zod_1.z.string().min(1),
    username: usernameField,
    avatar: zod_1.z.string().optional(),
    bio: zod_1.z.string().optional(),
});
// GET /api/users/check-username?u=<name>&wallet=<self> — live availability check.
// Declared before /:wallet so the literal path isn't swallowed as a wallet.
exports.usersRouter.get('/check-username', (0, validate_1.asyncHandler)(async (req, res) => {
    const u = typeof req.query.u === 'string' ? req.query.u.trim() : '';
    const self = typeof req.query.wallet === 'string' ? req.query.wallet : undefined;
    if (!USERNAME_RE.test(u)) {
        res.json({ available: false, reason: 'Username must be 3–20 letters, numbers, or underscores.' });
        return;
    }
    const taken = await usernameTaken(u, self);
    res.json({ available: !taken, reason: taken ? 'That username is taken.' : undefined });
}));
// POST /api/users — upsert by wallet. Enforces unique (case-insensitive) usernames.
exports.usersRouter.post('/', (0, validate_1.validateBody)(createUserSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    if (await usernameTaken(body.username, body.wallet)) {
        throw new error_1.HttpError(409, 'That username is taken.');
    }
    try {
        const doc = await User_1.UserModel.findOneAndUpdate({ wallet: body.wallet }, {
            $set: { username: body.username, avatar: body.avatar, bio: body.bio },
            $setOnInsert: { wallet: body.wallet },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.status(201).json((0, User_1.userToDTO)(doc));
    }
    catch (err) {
        // Backstop for the check→write race: the unique index rejects duplicates.
        if (err.code === 11000) {
            throw new error_1.HttpError(409, 'That username is taken.');
        }
        throw err;
    }
}));
// GET /api/users/search?q= — find users by username or wallet (prefix/substring).
// Declared BEFORE the /:wallet route so "search" isn't swallowed as a wallet.
exports.usersRouter.get('/search', (0, validate_1.asyncHandler)(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length === 0) {
        res.json([]);
        return;
    }
    // Escape regex metacharacters so user input is treated literally.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    const docs = await User_1.UserModel.find({ $or: [{ username: rx }, { wallet: rx }] })
        .limit(15)
        .sort({ username: 1 });
    res.json(docs.map(User_1.userToDTO));
}));
// GET /api/users/:wallet — enriched with follower/following counts + creator-program status.
exports.usersRouter.get('/:wallet', (0, validate_1.asyncHandler)(async (req, res) => {
    const doc = await User_1.UserModel.findOne({ wallet: req.params.wallet });
    if (!doc)
        throw new error_1.HttpError(404, 'User not found');
    res.json(await enrichUser(doc));
}));
// POST /api/users/:wallet/follow — toggle the requesting wallet's follow of :wallet.
const followSchema = zod_1.z.object({ follower: zod_1.z.string().min(1) });
exports.usersRouter.post('/:wallet/follow', (0, validate_1.validateBody)(followSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const following = req.params.wallet;
    const { follower } = req.body;
    if (follower === following)
        throw new error_1.HttpError(400, "You can't follow yourself");
    const existing = await Follow_1.FollowModel.findOne({ follower, following });
    if (existing) {
        await existing.deleteOne();
    }
    else {
        await Follow_1.FollowModel.create({ follower, following });
    }
    const followerCount = await Follow_1.FollowModel.countDocuments({ following });
    const result = { wallet: following, following: !existing, followerCount };
    res.json(result);
}));
// GET /api/users/:wallet/following — wallets this user follows (for the suggestion feed).
exports.usersRouter.get('/:wallet/following', (0, validate_1.asyncHandler)(async (req, res) => {
    const docs = await Follow_1.FollowModel.find({ follower: req.params.wallet }).select('following').lean();
    res.json(docs.map((d) => d.following));
}));
