/**
 * Users router — create (upsert by wallet) + fetch by wallet.
 *  POST /api/users
 *  GET  /api/users/:wallet
 */
import { Router } from 'express';
import { z } from 'zod';
import type { CreateUserBody } from '../contract';
import { UserModel, userToDTO } from '../models/User';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const usersRouter = Router();

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

// GET /api/users/:wallet
usersRouter.get(
  '/:wallet',
  asyncHandler(async (req, res) => {
    const doc = await UserModel.findOne({ wallet: req.params.wallet });
    if (!doc) throw new HttpError(404, 'User not found');
    res.json(userToDTO(doc));
  }),
);
