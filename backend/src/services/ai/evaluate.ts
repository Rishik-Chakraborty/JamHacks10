/**
 * AI oracle — evaluates the final challenge photo against the success criteria.
 *
 * Primary judge: Google Gemini 2.5 Flash vision model via the Google Generative
 * AI SDK, using structured JSON output (responseSchema) so the model is forced
 * to return the exact verdict shape — no brittle free-text parsing.
 *
 * Confidence calibration: an XGBoost-style gradient boosting model (trained on
 * historical / synthetic evaluations) blends with Gemini's raw confidence to
 * produce a calibrated final score. This is the GenAI + ML ensemble that makes
 * GymCast's oracle defensible to bettors and judges.
 *
 * Optional ensemble: a second opinion from a self-hosted Vultr GPU model
 * (`env.VULTR_VISION_URL`). On disagreement we force manual review. No-op when
 * the flag is unset.
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

import { env } from '../../config/env';
import type { OracleVerdict } from '../../contract';
import { MIN_CONFIDENCE } from '../../contract';
import { ORACLE_SYSTEM_PROMPT, buildOracleUserText } from './prompts';
import { runXGBoostInference } from './xgboost-inference';

export interface EvaluateImage {
  /** Raw base64 string OR a full data URL (data:mime;base64,...). */
  base64: string;
  mimeType: string;
}

export interface EvaluateGoalParams {
  /**
   * The proof to judge: a single photo, or several frames sampled from a video
   * (chronological order). At least one is required.
   */
  images: EvaluateImage[];
  goalText: string;
  successCriteria: string;
}

/** The enhanced verdict Gemini returns (superset of OracleVerdict). */
const geminiVerdictSchema = z.object({
  met: z.boolean().describe('Whether the success criteria is clearly met by the proof.'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Probability in [0,1] that the `met` verdict is correct. Be conservative.'),
  reasoning: z.string().describe('Brief justification tied to the observed evidence.'),
  observedEvidence: z
    .array(z.string())
    .describe('Concrete visual facts actually seen in the photo(s) and used to decide.'),
  photoQuality: z
    .number()
    .min(0)
    .max(1)
    .describe('Photo clarity and unambiguity score: 1.0 = crystal clear, 0.0 = illegible/unusable.'),
  effortLevel: z
    .enum(['low', 'medium', 'high'])
    .describe('Subjective effort level visible in the proof.'),
  goalCompletionPercent: z
    .number()
    .min(0)
    .max(100)
    .describe('Estimated percentage of the goal criteria visually completed (0-100).'),
  repCount: z
    .number()
    .int()
    .min(0)
    .describe(
      'Number of distinct exercise repetitions (e.g. squats, push-ups, pull-ups) counted across all frames. ' +
      'Set to 0 if the proof is a photo (not video) or if the criteria do not involve rep counting.',
    ),
});

type GeminiVerdict = z.infer<typeof geminiVerdictSchema>;

// ─── Gemini client ────────────────────────────────────────────────────────────

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(env.GOOGLE_VISION_API_KEY);
  return cachedClient;
}

/** Strip `data:<mime>;base64,` prefix so Gemini gets raw base64 only. */
function toRawBase64(imageBase64: string): string {
  const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/s);
  return match ? match[1] : imageBase64;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ─── Gemini vision call ───────────────────────────────────────────────────────

async function callGemini(params: EvaluateGoalParams): Promise<GeminiVerdict> {
  const gemini = getClient();

  const model = gemini.getGenerativeModel({
    model: env.GOOGLE_VISION_MODEL,
    systemInstruction: ORACLE_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          met: {
            type: SchemaType.BOOLEAN,
            description: 'Whether the success criteria is clearly met.',
          },
          confidence: {
            type: SchemaType.NUMBER,
            description: 'Probability [0,1] that the verdict is correct.',
          },
          reasoning: {
            type: SchemaType.STRING,
            description: 'Brief justification tied to observed evidence.',
          },
          observedEvidence: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Concrete visual facts used to decide.',
          },
          photoQuality: {
            type: SchemaType.NUMBER,
            description: 'Photo clarity score [0,1].',
          },
          effortLevel: {
            type: SchemaType.STRING,
            description: 'Visible effort: low | medium | high',
          },
          goalCompletionPercent: {
            type: SchemaType.NUMBER,
            description: 'Estimated completion percentage [0,100].',
          },
          repCount: {
            type: SchemaType.INTEGER,
            description:
              'Number of exercise reps counted across all frames. 0 if photo or no rep criteria.',
          },
        },
        required: [
          'met',
          'confidence',
          'reasoning',
          'observedEvidence',
          'photoQuality',
          'effortLevel',
          'goalCompletionPercent',
          'repCount',
        ],
      },
    },
  });

  const userText = buildOracleUserText(
    params.goalText,
    params.successCriteria,
    params.images.length,
  );

  const parts: Parameters<typeof model.generateContent>[0] = [
    { text: userText },
    ...params.images.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: toRawBase64(img.base64),
      },
    })),
  ];

  const result = await model.generateContent(parts);
  const text = result.response.text();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }

  const parsed = geminiVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Gemini verdict schema mismatch: ${parsed.error.message}. Raw: ${text.slice(0, 300)}`,
    );
  }

  return parsed.data;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Evaluate the final photo against the goal's success criteria.
 *
 * Pipeline:
 *   1. Call Gemini 2.5 Flash (structured JSON output)
 *   2. Feed Gemini features → XGBoost calibrator (gradient boosting)
 *   3. Blend: 65% Gemini confidence + 35% XGBoost calibration
 *   4. Optional: Vultr GPU second-opinion ensemble
 *   5. Gate: confidence < MIN_CONFIDENCE → needsManualReview
 *
 * @throws if the AI oracle is not configured (`env.aiEnabled` is false).
 */
export async function evaluateGoal(params: EvaluateGoalParams): Promise<OracleVerdict> {
  if (!env.aiEnabled) {
    throw new Error('AI oracle not configured: set GOOGLE_VISION_API_KEY to enable verdicts.');
  }
  if (params.images.length === 0) {
    throw new Error('No proof images provided to the AI oracle.');
  }

  // Step 1 — Gemini vision verdict
  const geminiVerdict = await callGemini(params);

  // Step 2 — XGBoost confidence calibration (sub-10ms, non-blocking on failure)
  let xgboostResult: Awaited<ReturnType<typeof runXGBoostInference>> | null = null;
  try {
    xgboostResult = await runXGBoostInference({
      geminiConfidence: clamp01(geminiVerdict.confidence),
      geminiMet: geminiVerdict.met ? 1 : 0,
      photoQuality: clamp01(geminiVerdict.photoQuality),
      effortLevel: geminiVerdict.effortLevel,
      goalCompletionPercent: clamp01(geminiVerdict.goalCompletionPercent / 100) * 100,
    });
  } catch (err) {
    console.warn('[ai] XGBoost calibration failed (non-fatal); using Gemini confidence only.', err);
  }

  // Step 3 — Derive final verdict from XGBoost success probability
  // xgboostResult.finalConfidence = P(goal achieved) [0,1] blended from Gemini + XGBoost.
  // We convert it back to (met, confidence) for the OracleVerdict shape.
  let finalMet: boolean;
  let finalConfidence: number;

  if (xgboostResult) {
    const successProb = xgboostResult.finalConfidence; // P(achieved)
    finalMet = successProb >= 0.5;
    // confidence = how sure we are of the verdict direction
    finalConfidence = clamp01(finalMet ? successProb : 1 - successProb);

    if (!xgboostResult.modelAgreement) {
      console.info(
        `[ai] Gemini/XGBoost disagreement — gemini=${geminiVerdict.met}, ` +
        `xgb_P(met)=${xgboostResult.calibratedConfidence.toFixed(3)}, ` +
        `final_met=${finalMet}, latency=${xgboostResult.latencyMs}ms`,
      );
    }
  } else {
    finalMet = geminiVerdict.met;
    finalConfidence = clamp01(geminiVerdict.confidence);
  }

  const repNote = geminiVerdict.repCount > 0
    ? ` Reps counted: ${geminiVerdict.repCount}.`
    : '';

  let verdict: OracleVerdict = {
    met: finalMet,
    confidence: finalConfidence,
    reasoning: xgboostResult
      ? `${geminiVerdict.reasoning}${repNote} [XGBoost P(success)=${(xgboostResult.finalConfidence * 100).toFixed(0)}%, latency ${xgboostResult.latencyMs}ms]`
      : `${geminiVerdict.reasoning}${repNote}`,
    observedEvidence: geminiVerdict.observedEvidence,
    needsManualReview: false,
  };

  // Step 4 — Optional Vultr GPU ensemble
  verdict = await applyEnsemble(verdict, params);

  // Step 5 — Final gate
  verdict.needsManualReview = verdict.needsManualReview || verdict.confidence < MIN_CONFIDENCE;

  return verdict;
}

// ─── Vultr ensemble (unchanged, secondary non-fatal second opinion) ───────────

const secondarySchema = z.object({ met: z.boolean(), confidence: z.number() });

async function querySecondaryOracle(
  params: EvaluateGoalParams,
): Promise<{ met: boolean; confidence: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(env.VULTR_VISION_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: params.images[0]?.base64,
          mimeType: params.images[0]?.mimeType,
          goalText: params.goalText,
          successCriteria: params.successCriteria,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.warn(`[ai] Vultr ensemble responded ${res.status}; ignoring second opinion.`);
      return null;
    }
    const json: unknown = await res.json();
    const parsed = secondarySchema.safeParse(json);
    if (!parsed.success) {
      console.warn('[ai] Vultr ensemble returned unparseable verdict; ignoring.');
      return null;
    }
    return { met: parsed.data.met, confidence: clamp01(parsed.data.confidence) };
  } catch (err) {
    console.warn('[ai] Vultr ensemble request failed; ignoring second opinion.', err);
    return null;
  }
}

async function applyEnsemble(
  primary: OracleVerdict,
  params: EvaluateGoalParams,
): Promise<OracleVerdict> {
  if (!env.VULTR_VISION_URL) return primary;

  const second = await querySecondaryOracle(params);
  if (!second) return primary;

  if (second.met !== primary.met) {
    return {
      ...primary,
      confidence: clamp01(Math.min(primary.confidence, second.confidence) * 0.5),
      reasoning: `${primary.reasoning} [Ensemble DISAGREEMENT: Vultr judged met=${second.met} (conf ${second.confidence.toFixed(2)}); routed to manual review.]`,
      needsManualReview: true,
    };
  }

  return {
    ...primary,
    confidence: clamp01(Math.min(primary.confidence, second.confidence)),
    reasoning: `${primary.reasoning} [Ensemble agreement: Vultr also judged met=${second.met}.]`,
  };
}
