/**
 * GymCast AI oracle service — public surface.
 *
 * - `evaluateGoal`: the GenAI core. Judges the final challenge photo against the
 *   success criteria via an OpenAI vision model with Structured Outputs, with an
 *   optional self-hosted Vultr GPU ensemble for a cross-checked second opinion.
 * - `generateCommentary`: cheap, funny play-by-play lines for the live ticker.
 *
 * All calls are server-side only; secrets never reach the client, and base64
 * image payloads are never logged.
 */
export { evaluateGoal } from './evaluate';
export type { EvaluateGoalParams, EvaluateImage } from './evaluate';
export { reviewGoal } from './reviewGoal';
export type { ReviewGoalParams } from './reviewGoal';
export { generateCommentary } from './commentary';
