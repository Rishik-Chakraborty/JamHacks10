/**
 * Comments / reactions router.
 *  POST /api/comments                  — create
 *  GET  /api/challenges/:id/comments    — list by challenge (mounted from challenges path)
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import type { CreateCommentBody } from '../contract';
import { CommentModel, commentToDTO } from '../models/Comment';
import { ChallengeModel } from '../models/Challenge';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const commentsRouter = Router();
/** Mounted under /api/challenges for the per-challenge comment list route. */
export const challengeCommentsRouter = Router({ mergeParams: true });

const createCommentSchema: z.ZodType<CreateCommentBody> = z.object({
  challengeId: z.string().min(1),
  wallet: z.string().min(1),
  type: z.enum(['comment', 'fire', 'skull', 'muscle']),
  body: z.string().optional(),
});

function assertObjectId(id: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, `Invalid ${label} id`);
  return new Types.ObjectId(id);
}

// POST /api/comments
commentsRouter.post(
  '/',
  validateBody(createCommentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCommentBody;
    const challengeId = assertObjectId(body.challengeId, 'challenge');

    const challenge = await ChallengeModel.findById(challengeId);
    if (!challenge) throw new HttpError(404, 'Challenge not found');

    const doc = await CommentModel.create({
      challengeId,
      wallet: body.wallet,
      type: body.type,
      body: body.body,
    });

    // Reactions add a little hype.
    await ChallengeModel.updateOne({ _id: challengeId }, { $inc: { hypeScore: 1 } });

    res.status(201).json(commentToDTO(doc));
  }),
);

// GET /api/challenges/:id/comments
challengeCommentsRouter.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const challengeId = assertObjectId(req.params.id, 'challenge');
    const docs = await CommentModel.find({ challengeId }).sort({ createdAt: -1 }).limit(200);
    res.json(docs.map(commentToDTO));
  }),
);
