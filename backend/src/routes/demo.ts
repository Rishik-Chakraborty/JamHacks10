/**
 * Demo-only helpers.
 *
 * These routes do not replace Solana settlement. They create realistic MongoDB
 * mirror bets so judges can see live odds movement before the on-chain program
 * is deployed/configured.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validateBody, asyncHandler } from '../middleware/validate';
import { runDemoBots } from '../services/demoBots';

export const demoRouter = Router();

const runBotsSchema = z.object({
  count: z.number().int().min(1).max(12).optional(),
});

demoRouter.post(
  '/bots/:id',
  validateBody(runBotsSchema),
  asyncHandler(async (req, res) => {
    const result = await runDemoBots(req.params.id, req.body.count);
    res.status(201).json(result);
  }),
);
