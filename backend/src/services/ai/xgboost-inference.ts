/**
 * XGBoost inference — loads the trained gradient boosting model and provides
 * confidence calibration for the Gemini vision oracle.
 *
 * The model is trained offline (xgboost-trainer.ts) and loaded lazily on first
 * inference call. If the model file doesn't exist, training runs automatically
 * on startup using synthetic data so the service is always self-contained.
 */
import fs from 'fs';
import type { GBModel } from './xgboost-trainer';
import { MODEL_PATH, predictProba, trainAndSave } from './xgboost-trainer';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Features extracted from a Gemini verdict for calibration. */
export interface XGBoostFeatures {
  geminiConfidence: number;   // [0,1] — Gemini's raw confidence
  geminiMet: number;          // 0 | 1 — Gemini's binary verdict
  photoQuality: number;       // [0,1] — photo clarity score from Gemini
  effortLevel: 'low' | 'medium' | 'high';
  goalCompletionPercent: number; // [0,100] — from Gemini's structured output
}

export interface XGBoostResult {
  /** Calibrated probability that the goal was truly achieved [0,1]. */
  calibratedConfidence: number;
  /** Gemini's raw confidence passed in. */
  geminiConfidence: number;
  /** The final blended confidence (0.65×Gemini + 0.35×XGBoost). */
  finalConfidence: number;
  /** Whether the model agrees with Gemini's binary verdict. */
  modelAgreement: boolean;
  /** Inference latency in milliseconds. */
  latencyMs: number;
}

// ─── Model cache ──────────────────────────────────────────────────────────────

let cachedModel: GBModel | null = null;

function encodeEffort(level: XGBoostFeatures['effortLevel']): number {
  return level === 'low' ? 0 : level === 'medium' ? 0.5 : 1;
}

/** Load or auto-train the model. */
async function getModel(): Promise<GBModel> {
  if (cachedModel) return cachedModel;

  if (fs.existsSync(MODEL_PATH)) {
    const raw = fs.readFileSync(MODEL_PATH, 'utf8');
    cachedModel = JSON.parse(raw) as GBModel;
    console.log(
      `[xgboost] Loaded model (test acc=${(cachedModel.testAccuracy * 100).toFixed(1)}%, ` +
      `trained ${cachedModel.trainedAt.slice(0, 10)})`,
    );
  } else {
    console.log('[xgboost] No model file found — auto-training on synthetic data…');
    cachedModel = await trainAndSave();
  }

  return cachedModel;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run XGBoost confidence calibration alongside a Gemini verdict.
 *
 * The final confidence is a weighted blend:
 *   finalConfidence = 0.65 × geminiConfidence + 0.35 × xgboostCalibratedConfidence
 *
 * This mirrors how XGBoost is used in production ensemble stacks: the neural
 * (Gemini) signal is the primary judge; XGBoost corrects systematic biases
 * learned from historical data.
 */
export async function runXGBoostInference(features: XGBoostFeatures): Promise<XGBoostResult> {
  const t0 = Date.now();
  const model = await getModel();

  const x = [
    features.geminiConfidence,
    features.geminiMet,
    features.photoQuality,
    encodeEffort(features.effortLevel),
    Math.max(0, Math.min(1, features.goalCompletionPercent / 100)),
  ];

  const calibratedConfidence = predictProba(model, x);
  const latencyMs = Date.now() - t0;

  // Convert Gemini's verdict into "probability goal was achieved":
  //   met=true  + confidence=0.88 → 88% chance it was achieved
  //   met=false + confidence=0.88 → 12% chance it was achieved (88% confident NOT met)
  const geminiSuccessProb = features.geminiMet === 1
    ? features.geminiConfidence
    : 1 - features.geminiConfidence;

  // Blend: Gemini visual signal (65%) + XGBoost calibration (35%).
  // finalConfidence = probability that the goal was genuinely achieved [0,1].
  const finalConfidence = Math.max(0, Math.min(1,
    0.65 * geminiSuccessProb + 0.35 * calibratedConfidence,
  ));

  const modelPredictsMet = calibratedConfidence >= 0.5;
  const geminiPredictsMet = features.geminiMet === 1;

  return {
    calibratedConfidence,
    geminiConfidence: features.geminiConfidence,
    finalConfidence,
    modelAgreement: modelPredictsMet === geminiPredictsMet,
    latencyMs,
  };
}

/** Pre-warm the model at server startup to avoid cold-start latency on first eval. */
export async function warmupXGBoost(): Promise<void> {
  try {
    await getModel();
  } catch (err) {
    console.warn('[xgboost] Warmup failed (non-fatal):', err);
  }
}

/** Force retrain and reload the cached model. */
export async function retrainModel(): Promise<GBModel> {
  cachedModel = null;
  const model = await trainAndSave();
  cachedModel = model;
  return model;
}
