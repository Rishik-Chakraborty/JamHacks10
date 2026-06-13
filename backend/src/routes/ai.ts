/**
 * POST /api/ai/evaluate — test endpoint for the Gemini + XGBoost oracle.
 *
 * Accepts a base64-encoded image URL or inline data and evaluates it against
 * the provided goal and success criteria. Used by the test suite and for
 * judge demos; the real resolution flow uses the same `evaluateGoal` service
 * via routes/challenges.ts (POST /api/challenges/:id/resolve).
 */
import { Router } from 'express';
import { z } from 'zod';
import { evaluateGoal } from '../services/ai';
import { retrainModel } from '../services/ai';
import { validateBody } from '../middleware/validate';
import { env } from '../config/env';

export const aiRouter = Router();

const evaluateBody = z.object({
  imageUrl: z.string().optional().describe('Public image URL (fetched server-side)'),
  imageBase64: z.string().optional().describe('Raw or data-URL base64'),
  mimeType: z.string().default('image/jpeg'),
  goalText: z.string().min(1),
  successCriteria: z.string().min(1),
});

aiRouter.post('/evaluate', validateBody(evaluateBody), async (req, res, next) => {
  try {
    if (!env.aiEnabled) {
      res.status(503).json({ error: 'AI oracle not configured (missing GOOGLE_VISION_API_KEY)' });
      return;
    }

    const { imageUrl, imageBase64, mimeType, goalText, successCriteria } = req.body as z.infer<typeof evaluateBody>;

    let base64Data: string;

    if (imageBase64) {
      base64Data = imageBase64;
    } else if (imageUrl) {
      // Fetch image server-side (never expose the URL to clients)
      const fetchRes = await fetch(imageUrl);
      if (!fetchRes.ok) {
        res.status(400).json({ error: `Failed to fetch image: HTTP ${fetchRes.status}` });
        return;
      }
      const buf = Buffer.from(await fetchRes.arrayBuffer());
      base64Data = buf.toString('base64');
    } else {
      res.status(400).json({ error: 'Provide either imageBase64 or imageUrl' });
      return;
    }

    const t0 = Date.now();
    const verdict = await evaluateGoal({
      images: [{ base64: base64Data, mimeType }],
      goalText,
      successCriteria,
    });

    res.json({ verdict, latencyMs: Date.now() - t0 });
  } catch (err) {
    next(err);
  }
});

/** POST /api/ai/retrain — force XGBoost retrain (admin use). */
aiRouter.post('/retrain', async (_req, res, next) => {
  try {
    const model = await retrainModel();
    res.json({
      message: 'Model retrained successfully',
      trainAccuracy: model.trainAccuracy,
      testAccuracy: model.testAccuracy,
      nSamples: model.nSamples,
      trainedAt: model.trainedAt,
    });
  } catch (err) {
    next(err);
  }
});
