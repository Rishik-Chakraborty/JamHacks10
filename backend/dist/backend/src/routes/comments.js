"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.challengeCommentsRouter = exports.commentsRouter = void 0;
/**
 * Comments / reactions router.
 *  POST /api/comments                  — create
 *  GET  /api/challenges/:id/comments    — list by challenge (mounted from challenges path)
 */
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const zod_1 = require("zod");
const Comment_1 = require("../models/Comment");
const Challenge_1 = require("../models/Challenge");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.commentsRouter = (0, express_1.Router)();
/** Mounted under /api/challenges for the per-challenge comment list route. */
exports.challengeCommentsRouter = (0, express_1.Router)({ mergeParams: true });
const createCommentSchema = zod_1.z.object({
    challengeId: zod_1.z.string().min(1),
    wallet: zod_1.z.string().min(1),
    type: zod_1.z.enum(['comment', 'fire', 'skull', 'muscle']),
    body: zod_1.z.string().optional(),
});
function assertObjectId(id, label) {
    if (!mongoose_1.Types.ObjectId.isValid(id))
        throw new error_1.HttpError(400, `Invalid ${label} id`);
    return new mongoose_1.Types.ObjectId(id);
}
// POST /api/comments
exports.commentsRouter.post('/', (0, validate_1.validateBody)(createCommentSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    const challengeId = assertObjectId(body.challengeId, 'challenge');
    const challenge = await Challenge_1.ChallengeModel.findById(challengeId);
    if (!challenge)
        throw new error_1.HttpError(404, 'Challenge not found');
    const doc = await Comment_1.CommentModel.create({
        challengeId,
        wallet: body.wallet,
        type: body.type,
        body: body.body,
    });
    // Reactions add a little hype.
    await Challenge_1.ChallengeModel.updateOne({ _id: challengeId }, { $inc: { hypeScore: 1 } });
    res.status(201).json((0, Comment_1.commentToDTO)(doc));
}));
// GET /api/challenges/:id/comments
exports.challengeCommentsRouter.get('/:id/comments', (0, validate_1.asyncHandler)(async (req, res) => {
    const challengeId = assertObjectId(req.params.id, 'challenge');
    const docs = await Comment_1.CommentModel.find({ challengeId }).sort({ createdAt: -1 }).limit(200);
    res.json(docs.map(Comment_1.commentToDTO));
}));
