/**
 * GymCast AI oracle service — public surface.
 *
 * - `evaluateGoal`: Gemini 2.5 Flash vision + XGBoost confidence calibration.
 *   The GenAI core that judges the final challenge photo and resolves markets.
 * - `generateCommentary`: GPT-4o ticker lines for the live activity feed.
 * - `reviewGoal`: GPT-4o goal-criteria reviewer (gates custom challenge creation).
 * - `runXGBoostInference` / `warmupXGBoost` / `retrainModel`: XGBoost calibrator.
 *
 * All calls are server-side only; secrets never reach the client.
 */
export { evaluateGoal } from './evaluate';
export type { EvaluateGoalParams, EvaluateImage } from './evaluate';
export { reviewGoal } from './reviewGoal';
export type { ReviewGoalParams } from './reviewGoal';
export { generateCommentary } from './commentary';
export { runXGBoostInference, warmupXGBoost, retrainModel } from './xgboost-inference';
export type { XGBoostFeatures, XGBoostResult } from './xgboost-inference';
export { trainAndSave, generateSyntheticData, computeAccuracy } from './xgboost-trainer';
export type { GBModel, TrainingExample } from './xgboost-trainer';
