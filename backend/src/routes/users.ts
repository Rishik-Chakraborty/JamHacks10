/**
 * Users router — create (upsert by wallet) + fetch by wallet.
 *  POST /api/users
 *  GET  /api/users/:wallet
 */
import { Router } from 'express';
import { z } from 'zod';
import { type HydratedDocument } from 'mongoose';
import type { CreateUserBody, User, FollowResult } from '../contract';
import { CREATOR_PROGRAM_FOLLOWER_THRESHOLD } from '../contract';
import { UserModel, userToDTO, type UserDoc } from '../models/User';
import { FollowModel, followCounts } from '../models/Follow';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const usersRouter = Router();

/**
 * Enrich a base User DTO with social-graph counts and creator-program status.
 * Exported so the profile route can reuse it.
 */
export async function enrichUser(doc: HydratedDocument<UserDoc>): Promise<User> {
  const base = userToDTO(doc);
  const { followerCount, followingCount } = await followCounts(base.wallet);
  return {
    ...base,
    followerCount,
    followingCount,
    creatorProgram: followerCount >= CREATOR_PROGRAM_FOLLOWER_THRESHOLD,
  };
}

const createUserSchema: z.ZodType<CreateUserBody> = z.object({
  wallet: z.string().min(1),
  username: z.string().min(1),
  avatar: z.string().optional(),
  bio: z.string().optional(),
});

// POST /api/users — upsert by wallet.
usersRouter.post(
  '/',
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserBody;
    const doc = await UserModel.findOneAndUpdate(
      { wallet: body.wallet },
      {
        $set: { username: body.username, avatar: body.avatar, bio: body.bio },
        $setOnInsert: { wallet: body.wallet },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.status(201).json(userToDTO(doc));
  }),
);

// GET /api/users/search?q= — find users by username or wallet (prefix/substring).
// Declared BEFORE the /:wallet route so "search" isn't swallowed as a wallet.
usersRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length === 0) {
      res.json([]);
      return;
    }
    // Escape regex metacharacters so user input is treated literally.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    const docs = await UserModel.find({ $or: [{ username: rx }, { wallet: rx }] })
      .limit(15)
      .sort({ username: 1 });
    res.json(docs.map(userToDTO));
  }),
);

// GET /api/users/:wallet — enriched with follower/following counts + creator-program status.
usersRouter.get(
  '/:wallet',
  asyncHandler(async (req, res) => {
    const doc = await UserModel.findOne({ wallet: req.params.wallet });
    if (!doc) throw new HttpError(404, 'User not found');
    res.json(await enrichUser(doc));
  }),
);

// POST /api/users/:wallet/follow — toggle the requesting wallet's follow of :wallet.
const followSchema = z.object({ follower: z.string().min(1) });
usersRouter.post(
  '/:wallet/follow',
  validateBody(followSchema),
  asyncHandler(async (req, res) => {
    const following = req.params.wallet;
    const { follower } = req.body as z.infer<typeof followSchema>;
    if (follower === following) throw new HttpError(400, "You can't follow yourself");

    const existing = await FollowModel.findOne({ follower, following });
    if (existing) {
      await existing.deleteOne();
    } else {
      await FollowModel.create({ follower, following });
    }

    const followerCount = await FollowModel.countDocuments({ following });
    const result: FollowResult = { wallet: following, following: !existing, followerCount };
    res.json(result);
  }),
);

// GET /api/users/:wallet/following — wallets this user follows (for the suggestion feed).
usersRouter.get(
  '/:wallet/following',
  asyncHandler(async (req, res) => {
    const docs = await FollowModel.find({ follower: req.params.wallet }).select('following').lean();
    res.json(docs.map((d) => d.following));
  }),
);
