/**
 * AI custom-goal reviewer — the gate that decides whether a user-submitted
 * (non-template) challenge is objective and verifiable enough to open a
 * real-money market. Uses the same OpenAI account as the oracle, with Structured
 * Outputs so the model is forced to return a clean {@link GoalReview} shape.
 *
 * Pre-made template challenges skip this entirely (they're pre-approved). Only
 * the custom path is reviewed. Degrades gracefully: when AI is not configured the
 * caller lets the goal through unreviewed (see routes/challenges.ts).
 */
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { env } from '../../config/env';
import type { GoalReview } from '../../contract';
import { GOAL_REVIEW_SYSTEM_PROMPT, buildGoalReviewUserText } from './prompts';

export interface ReviewGoalParams {
  title: string;
  goalText: string;
  successCriteria: string;
}

const reviewSchema = z
  .object({
    approved: z.boolean().describe('Whether the goal meets ALL the standards.'),
    feedback: z
      .string()
      .describe('Why it passed, or — if rejected — exactly what the user must change to pass.'),
    improvedCriteria: z
      .string()
      .describe(
        'When approved: a tightened, objective, single-paragraph success criteria the vision oracle can rule on from the final proof. Empty string when rejected.',
      ),
  })
  .strict();

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

/**
 * Review a custom goal. Throws only if the AI is unreachable/misconfigured — the
 * caller decides how to handle that (we fail open so a flaky AI never blocks the
 * demo). A clean rejection returns `{ approved: false, feedback }`.
 */
export async function reviewGoal(params: ReviewGoalParams): Promise<GoalReview> {
  if (!env.commentaryEnabled) {
    throw new Error('AI reviewer not configured: set OPENAI_API_KEY to enable custom-goal review.');
  }

  const completion = await client().beta.chat.completions.parse({
    // Reviewing text is cheap — use the commentary model.
    model: env.OPENAI_COMMENTARY_MODEL,
    messages: [
      { role: 'system', content: GOAL_REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildGoalReviewUserText(params.title, params.goalText, params.successCriteria),
      },
    ],
    response_format: zodResponseFormat(reviewSchema, 'goal_review'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message.refusal;
    throw new Error(`AI reviewer returned no structured result${refusal ? `: ${refusal}` : ''}.`);
  }

  const improved = parsed.improvedCriteria.trim();
  return {
    approved: parsed.approved,
    feedback: parsed.feedback,
    improvedCriteria: parsed.approved && improved !== '' ? improved : undefined,
  };
}
