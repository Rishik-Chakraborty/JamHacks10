/**
 * Gradient Boosting trainer — XGBoost-style confidence calibration for the
 * GymCast vision oracle. Trains on historical (or synthetic) evaluation data
 * to learn when Gemini's raw confidence scores are well-calibrated.
 *
 * Algorithm: gradient boosted decision stumps with Newton-step leaf values,
 * optimising log-loss (same loss as XGBoost's `binary:logistic` objective).
 * Model is serialised to JSON so no native Python dependency is needed.
 */
import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GBStump {
  featureIndex: number;
  threshold: number;
  leftValue: number;
  rightValue: number;
}

export interface GBModel {
  baseLogOdds: number;
  learningRate: number;
  stumps: GBStump[];
  featureNames: string[];
  trainAccuracy: number;
  testAccuracy: number;
  trainedAt: string;
  nSamples: number;
}

export interface TrainingExample {
  /** [geminiConfidence, geminiMet, photoQuality, effortEncoded, goalCompletionNorm] */
  features: number[];
  label: number; // 0 | 1
}

export const FEATURE_NAMES = [
  'gemini_confidence',
  'gemini_met',
  'photo_quality',
  'effort_level',
  'goal_completion_norm',
];

export const MODEL_PATH = path.resolve(__dirname, '../../../models/xgboost-evaluator.json');

// ─── Math helpers ─────────────────────────────────────────────────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, x))));
}

/** Box-Muller normal sample with mean 0 and given std. */
function gaussianNoise(std: number): number {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  return std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(x: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

// ─── Synthetic data generation ────────────────────────────────────────────────

/**
 * Generates synthetic training examples with realistic feature correlations.
 * Used when < 10 real historical evaluations are in the database.
 *
 * Feature layout (FEATURE_NAMES):
 *   0  gemini_confidence    [0,1]   — Gemini's raw confidence
 *   1  gemini_met           {0,1}   — Gemini's binary verdict
 *   2  photo_quality        [0,1]   — Photo clarity score
 *   3  effort_level         {0, 0.5, 1} — low/medium/high encoded
 *   4  goal_completion_norm [0,1]   — Gemini's goal completion / 100
 */
export function generateSyntheticData(n = 120): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (let i = 0; i < n; i++) {
    const trueOutcome = Math.random() > 0.5 ? 1 : 0;

    // Gemini confidence: confidence IN THE VERDICT (either direction), NOT a proxy for success.
    // High confidence → Gemini is very sure about whichever verdict it gave (met or not met).
    // This decouples it from the outcome so the model learns geminiMet as the key signal.
    const isHighConfidence = Math.random() < 0.7;
    const geminiConfidence = clamp(
      isHighConfidence
        ? 0.62 + Math.random() * 0.33 + gaussianNoise(0.04)  // [0.62, 0.95] confident verdict
        : 0.28 + Math.random() * 0.32 + gaussianNoise(0.04), // [0.28, 0.60] uncertain verdict
    );

    // Gemini met: ~87% accuracy (realistic for a strong vision model)
    const geminiMet = Math.random() < 0.87 ? trueOutcome : 1 - trueOutcome;

    // Photo quality: positively correlated with evidence strength
    const photoQuality = clamp(
      (trueOutcome === 1 ? 0.65 : 0.30) + gaussianNoise(0.18),
    );

    // Effort level: winners tend toward medium/high effort
    const effortRaw = trueOutcome === 1
      ? Math.floor(Math.random() * 3)  // low | medium | high, all possible
      : Math.floor(Math.random() * 2); // low | medium only
    const effortEncoded = effortRaw / 2; // 0, 0.5, 1

    // Goal completion: strongly predictive
    const goalCompletion = clamp(
      (trueOutcome === 1 ? 0.72 : 0.28) + gaussianNoise(0.14),
    );

    examples.push({
      features: [geminiConfidence, geminiMet, photoQuality, effortEncoded, goalCompletion],
      label: trueOutcome,
    });
  }

  return examples;
}

// ─── Core gradient boosting ───────────────────────────────────────────────────

function findBestStump(
  X: number[][],
  residuals: number[],
  hessians: number[],
  featureIndex: number,
): { threshold: number; gain: number; leftVal: number; rightVal: number } {
  const n = X.length;
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => X[a][featureIndex] - X[b][featureIndex]);

  const sumRTotal = residuals.reduce((s, r) => s + r, 0);
  const sumHTotal = hessians.reduce((s, h) => s + h, 0);

  let sumRL = 0, sumHL = 0;
  let bestGain = -Infinity;
  let bestThreshold = 0;
  let bestLeftVal = 0;
  let bestRightVal = 0;

  for (let k = 0; k < n - 1; k++) {
    const idx = order[k];
    sumRL += residuals[idx];
    sumHL += hessians[idx];

    // Skip ties
    if (X[order[k]][featureIndex] === X[order[k + 1]][featureIndex]) continue;

    const sumRR = sumRTotal - sumRL;
    const sumHR = sumHTotal - sumHL;
    if (sumHL < 1e-8 || sumHR < 1e-8) continue;

    const gain = (sumRL * sumRL) / sumHL + (sumRR * sumRR) / sumHR;

    if (gain > bestGain) {
      bestGain = gain;
      bestThreshold = (X[order[k]][featureIndex] + X[order[k + 1]][featureIndex]) / 2;
      bestLeftVal = sumRL / sumHL;
      bestRightVal = sumRR / sumHR;
    }
  }

  return { threshold: bestThreshold, gain: bestGain, leftVal: bestLeftVal, rightVal: bestRightVal };
}

/**
 * Train a gradient boosting model (decision stumps, log-loss objective).
 * Equivalent to XGBoost with `max_depth=1`, `objective='binary:logistic'`.
 */
export function trainGBM(
  X: number[][],
  y: number[],
  nRounds = 60,
  learningRate = 0.15,
): Omit<GBModel, 'trainAccuracy' | 'testAccuracy' | 'trainedAt' | 'nSamples'> {
  const n = X.length;
  const nFeatures = X[0].length;

  const meanY = y.reduce((s, v) => s + v, 0) / n;
  const baseLogOdds = Math.log((meanY + 1e-8) / (1 - meanY + 1e-8));

  const F = Array<number>(n).fill(baseLogOdds);
  const stumps: GBStump[] = [];

  for (let round = 0; round < nRounds; round++) {
    const probs = F.map(sigmoid);
    const residuals = y.map((yi, i) => yi - probs[i]);
    const hessians = probs.map((p) => p * (1 - p) + 1e-8);

    let bestFeature = 0;
    let bestGain = -Infinity;
    let bestThreshold = 0;
    let bestLeftVal = 0;
    let bestRightVal = 0;

    for (let j = 0; j < nFeatures; j++) {
      const { threshold, gain, leftVal, rightVal } = findBestStump(X, residuals, hessians, j);
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = j;
        bestThreshold = threshold;
        bestLeftVal = leftVal;
        bestRightVal = rightVal;
      }
    }

    const stump: GBStump = {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      leftValue: bestLeftVal,
      rightValue: bestRightVal,
    };
    stumps.push(stump);

    for (let i = 0; i < n; i++) {
      const delta = X[i][bestFeature] <= bestThreshold ? stump.leftValue : stump.rightValue;
      F[i] += learningRate * delta;
    }
  }

  return { baseLogOdds, learningRate, stumps, featureNames: FEATURE_NAMES };
}

// ─── Accuracy helpers ─────────────────────────────────────────────────────────

export function predictProba(
  model: Pick<GBModel, 'baseLogOdds' | 'learningRate' | 'stumps'>,
  x: number[],
): number {
  let logOdds = model.baseLogOdds;
  for (const s of model.stumps) {
    logOdds += model.learningRate * (x[s.featureIndex] <= s.threshold ? s.leftValue : s.rightValue);
  }
  return sigmoid(logOdds);
}

export function computeAccuracy(
  model: Pick<GBModel, 'baseLogOdds' | 'learningRate' | 'stumps'>,
  X: number[][],
  y: number[],
): number {
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const pred = predictProba(model, X[i]) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }
  return correct / X.length;
}

// ─── Train + save ─────────────────────────────────────────────────────────────

/**
 * Run the full training pipeline:
 *   1. Generate synthetic data (or load real evaluations — stub for now)
 *   2. 80/20 train/test split
 *   3. Train gradient boosting model
 *   4. Evaluate and save JSON checkpoint
 *
 * Returns the trained model with metrics attached.
 */
export async function trainAndSave(examples?: TrainingExample[]): Promise<GBModel> {
  const data = examples ?? generateSyntheticData(120);

  // Shuffle
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }

  const splitIdx = Math.floor(data.length * 0.8);
  const trainData = data.slice(0, splitIdx);
  const testData = data.slice(splitIdx);

  const Xtrain = trainData.map((e) => e.features);
  const ytrain = trainData.map((e) => e.label);
  const Xtest = testData.map((e) => e.features);
  const ytest = testData.map((e) => e.label);

  console.log(`[xgboost] Training on ${Xtrain.length} samples, testing on ${Xtest.length}…`);

  const base = trainGBM(Xtrain, ytrain, 60, 0.15);
  const trainAcc = computeAccuracy(base, Xtrain, ytrain);
  const testAcc = computeAccuracy(base, Xtest, ytest);

  console.log(`[xgboost] Train accuracy: ${(trainAcc * 100).toFixed(1)}% | Test accuracy: ${(testAcc * 100).toFixed(1)}%`);

  const model: GBModel = {
    ...base,
    trainAccuracy: trainAcc,
    testAccuracy: testAcc,
    trainedAt: new Date().toISOString(),
    nSamples: data.length,
  };

  const dir = path.dirname(MODEL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2), 'utf8');
  console.log(`[xgboost] Model saved to ${MODEL_PATH}`);

  return model;
}
