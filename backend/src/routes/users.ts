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

// GET /api/users/:wallet
usersRouter.get(
  '/:wallet',
  asyncHandler(async (req, res) => {
    const doc = await UserModel.findOne({ wallet: req.params.wallet });
    if (!doc) throw new HttpError(404, 'User not found');
    res.json(userToDTO(doc));
  }),
);
