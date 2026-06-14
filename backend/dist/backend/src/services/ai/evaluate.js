"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateGoal = evaluateGoal;
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
const generative_ai_1 = require("@google/generative-ai");
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("openai/helpers/zod");
const zod_2 = require("zod");
const env_1 = require("../../config/env");
const contract_1 = require("../../contract");
const prompts_1 = require("./prompts");
const xgboost_inference_1 = require("./xgboost-inference");
/** The enhanced verdict Gemini returns (superset of OracleVerdict). */
const geminiVerdictSchema = zod_2.z.object({
    met: zod_2.z.boolean().describe('Whether the success criteria is clearly met by the proof.'),
    confidence: zod_2.z
        .number()
        .min(0)
        .max(1)
        .describe('Probability in [0,1] that the `met` verdict is correct. Be conservative.'),
    reasoning: zod_2.z.string().describe('Brief justification tied to the observed evidence.'),
    observedEvidence: zod_2.z
        .array(zod_2.z.string())
        .describe('Concrete visual facts actually seen in the photo(s) and used to decide.'),
    photoQuality: zod_2.z
        .number()
        .min(0)
        .max(1)
        .describe('Photo clarity and unambiguity score: 1.0 = crystal clear, 0.0 = illegible/unusable.'),
    effortLevel: zod_2.z
        .enum(['low', 'medium', 'high'])
        .describe('Subjective effort level visible in the proof.'),
    goalCompletionPercent: zod_2.z
        .number()
        .min(0)
        .max(100)
        .describe('Estimated percentage of the goal criteria visually completed (0-100).'),
    repCount: zod_2.z
        .number()
        .int()
        .min(0)
        .describe('Number of distinct exercise repetitions (e.g. squats, push-ups, pull-ups) counted across all frames. ' +
        'Set to 0 if the proof is a photo (not video) or if the criteria do not involve rep counting.'),
});
// ─── Gemini client ────────────────────────────────────────────────────────────
let cachedClient = null;
function getClient() {
    if (!cachedClient)
        cachedClient = new generative_ai_1.GoogleGenerativeAI(env_1.env.GOOGLE_VISION_API_KEY);
    return cachedClient;
}
/** Strip `data:<mime>;base64,` prefix so Gemini gets raw base64 only. */
function toRawBase64(imageBase64) {
    const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/s);
    return match ? match[1] : imageBase64;
}
function clamp01(n) {
    if (Number.isNaN(n))
        return 0;
    return Math.max(0, Math.min(1, n));
}
// ─── Gemini vision call ───────────────────────────────────────────────────────
/**
 * Retry transient Gemini failures (503 overloaded / 429 rate-limit / network
 * blips) with exponential backoff. Non-transient errors (bad request, schema)
 * rethrow immediately. Gemini's free tier 503s under load surprisingly often, so
 * without this a perfectly valid final proof can silently fail to get a verdict.
 */
async function withGeminiRetry(fn, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const transient = /(\b503\b|\b429\b|unavailable|overloaded|high demand|rate.?limit|ECONNRESET|ETIMEDOUT|fetch failed)/i.test(msg);
            if (!transient || i === attempts - 1)
                throw err;
            await new Promise((r) => setTimeout(r, 600 * 2 ** i)); // 0.6s, 1.2s
        }
    }
    throw lastErr;
}
async function callGemini(params) {
    const gemini = getClient();
    const model = gemini.getGenerativeModel({
        model: env_1.env.GOOGLE_VISION_MODEL,
        systemInstruction: prompts_1.ORACLE_SYSTEM_PROMPT,
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: generative_ai_1.SchemaType.OBJECT,
                properties: {
                    met: {
                        type: generative_ai_1.SchemaType.BOOLEAN,
                        description: 'Whether the success criteria is clearly met.',
                    },
                    confidence: {
                        type: generative_ai_1.SchemaType.NUMBER,
                        description: 'Probability [0,1] that the verdict is correct.',
                    },
                    reasoning: {
                        type: generative_ai_1.SchemaType.STRING,
                        description: 'Brief justification tied to observed evidence.',
                    },
                    observedEvidence: {
                        type: generative_ai_1.SchemaType.ARRAY,
                        items: { type: generative_ai_1.SchemaType.STRING },
                        description: 'Concrete visual facts used to decide.',
                    },
                    photoQuality: {
                        type: generative_ai_1.SchemaType.NUMBER,
                        description: 'Photo clarity score [0,1].',
                    },
                    effortLevel: {
                        type: generative_ai_1.SchemaType.STRING,
                        description: 'Visible effort: low | medium | high',
                    },
                    goalCompletionPercent: {
                        type: generative_ai_1.SchemaType.NUMBER,
                        description: 'Estimated completion percentage [0,100].',
                    },
                    repCount: {
                        type: generative_ai_1.SchemaType.INTEGER,
                        description: 'Number of exercise reps counted across all frames. 0 if photo or no rep criteria.',
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
    const userText = (0, prompts_1.buildOracleUserText)(params.goalText, params.successCriteria, params.images.length);
    const parts = [
        { text: userText },
        ...params.images.map((img) => ({
            inlineData: {
                mimeType: img.mimeType,
                data: toRawBase64(img.base64),
            },
        })),
    ];
    const result = await withGeminiRetry(() => model.generateContent(parts));
    const text = result.response.text();
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
    }
    const parsed = geminiVerdictSchema.safeParse(raw);
    if (!parsed.success) {
        throw new Error(`Gemini verdict schema mismatch: ${parsed.error.message}. Raw: ${text.slice(0, 300)}`);
    }
    return parsed.data;
}
// ─── OpenAI vision fallback ───────────────────────────────────────────────────
/**
 * Same verdict shape as Gemini, but WITHOUT numeric min/max — OpenAI's strict
 * structured-output mode rejects `minimum`/`maximum` keywords. Ranges are stated
 * in the descriptions instead, and downstream `clamp01` keeps values in-bounds.
 */
const openaiVerdictSchema = zod_2.z
    .object({
    met: zod_2.z.boolean().describe('Whether the success criteria is clearly met by the proof.'),
    confidence: zod_2.z.number().describe('Probability in [0,1] that the verdict is correct. Be conservative.'),
    reasoning: zod_2.z.string().describe('Brief justification tied to the observed evidence.'),
    observedEvidence: zod_2.z.array(zod_2.z.string()).describe('Concrete visual facts seen in the photo(s).'),
    photoQuality: zod_2.z.number().describe('Clarity/unambiguity score in [0,1].'),
    effortLevel: zod_2.z.enum(['low', 'medium', 'high']).describe('Subjective effort level visible.'),
    goalCompletionPercent: zod_2.z.number().describe('Estimated completion percentage in [0,100].'),
    repCount: zod_2.z.number().int().describe('Reps counted across frames; 0 for a photo or non-rep goal.'),
})
    .strict();
let cachedOpenAI = null;
function openaiClient() {
    if (!cachedOpenAI)
        cachedOpenAI = new openai_1.default({ apiKey: env_1.env.OPENAI_API_KEY });
    return cachedOpenAI;
}
/** OpenAI wants a full data URL; build one if we were handed raw base64. */
function toDataUrl(img) {
    return img.base64.startsWith('data:') ? img.base64 : `data:${img.mimeType};base64,${img.base64}`;
}
/**
 * Fallback oracle: OpenAI gpt-4o vision with the same structured verdict, used
 * when Gemini is unavailable. gpt-4o accepts multiple images, so this works for
 * both a single photo and a video's sampled frames.
 */
async function callOpenAIVision(params) {
    const userText = (0, prompts_1.buildOracleUserText)(params.goalText, params.successCriteria, params.images.length);
    const completion = await openaiClient().beta.chat.completions.parse({
        model: env_1.env.OPENAI_COMMENTARY_MODEL,
        messages: [
            { role: 'system', content: prompts_1.ORACLE_SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userText },
                    ...params.images.map((img) => ({
                        type: 'image_url',
                        image_url: { url: toDataUrl(img) },
                    })),
                ],
            },
        ],
        response_format: (0, zod_1.zodResponseFormat)(openaiVerdictSchema, 'oracle_verdict'),
    });
    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
        const refusal = completion.choices[0]?.message.refusal;
        throw new Error(`OpenAI vision oracle returned no structured result${refusal ? `: ${refusal}` : ''}.`);
    }
    return parsed;
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
async function evaluateGoal(params) {
    if (!env_1.env.aiEnabled) {
        throw new Error('AI oracle not configured: set GOOGLE_VISION_API_KEY to enable verdicts.');
    }
    if (params.images.length === 0) {
        throw new Error('No proof images provided to the AI oracle.');
    }
    // Step 1 — vision verdict. Gemini is primary; if it fails (e.g. a 503 overload,
    // even after retries) fall back to OpenAI gpt-4o vision so a real model still
    // produces the verdict instead of stranding the line.
    let geminiVerdict;
    try {
        geminiVerdict = await callGemini(params);
    }
    catch (geminiErr) {
        if (!env_1.env.commentaryEnabled)
            throw geminiErr; // no fallback configured → surface the error
        console.warn(`[ai] Gemini oracle failed; falling back to OpenAI vision: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`);
        geminiVerdict = await callOpenAIVision(params);
    }
    // Step 2 — XGBoost confidence calibration (sub-10ms, non-blocking on failure)
    let xgboostResult = null;
    try {
        xgboostResult = await (0, xgboost_inference_1.runXGBoostInference)({
            geminiConfidence: clamp01(geminiVerdict.confidence),
            geminiMet: geminiVerdict.met ? 1 : 0,
            photoQuality: clamp01(geminiVerdict.photoQuality),
            effortLevel: geminiVerdict.effortLevel,
            goalCompletionPercent: clamp01(geminiVerdict.goalCompletionPercent / 100) * 100,
        });
    }
    catch (err) {
        console.warn('[ai] XGBoost calibration failed (non-fatal); using Gemini confidence only.', err);
    }
    // Step 3 — Derive final verdict from XGBoost success probability
    // xgboostResult.finalConfidence = P(goal achieved) [0,1] blended from Gemini + XGBoost.
    // We convert it back to (met, confidence) for the OracleVerdict shape.
    let finalMet;
    let finalConfidence;
    if (xgboostResult) {
        const successProb = xgboostResult.finalConfidence; // P(achieved)
        finalMet = successProb >= 0.5;
        // confidence = how sure we are of the verdict direction
        finalConfidence = clamp01(finalMet ? successProb : 1 - successProb);
        if (!xgboostResult.modelAgreement) {
            console.info(`[ai] Gemini/XGBoost disagreement — gemini=${geminiVerdict.met}, ` +
                `xgb_P(met)=${xgboostResult.calibratedConfidence.toFixed(3)}, ` +
                `final_met=${finalMet}, latency=${xgboostResult.latencyMs}ms`);
        }
    }
    else {
        finalMet = geminiVerdict.met;
        finalConfidence = clamp01(geminiVerdict.confidence);
    }
    const repNote = geminiVerdict.repCount > 0
        ? ` Reps counted: ${geminiVerdict.repCount}.`
        : '';
    let verdict = {
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
    verdict.needsManualReview = verdict.needsManualReview || verdict.confidence < contract_1.MIN_CONFIDENCE;
    return verdict;
}
// ─── Vultr ensemble (unchanged, secondary non-fatal second opinion) ───────────
const secondarySchema = zod_2.z.object({ met: zod_2.z.boolean(), confidence: zod_2.z.number() });
async function querySecondaryOracle(params) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        let res;
        try {
            res = await fetch(env_1.env.VULTR_VISION_URL, {
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
        }
        finally {
            clearTimeout(timer);
        }
        if (!res.ok) {
            console.warn(`[ai] Vultr ensemble responded ${res.status}; ignoring second opinion.`);
            return null;
        }
        const json = await res.json();
        const parsed = secondarySchema.safeParse(json);
        if (!parsed.success) {
            console.warn('[ai] Vultr ensemble returned unparseable verdict; ignoring.');
            return null;
        }
        return { met: parsed.data.met, confidence: clamp01(parsed.data.confidence) };
    }
    catch (err) {
        console.warn('[ai] Vultr ensemble request failed; ignoring second opinion.', err);
        return null;
    }
}
async function applyEnsemble(primary, params) {
    if (!env_1.env.VULTR_VISION_URL)
        return primary;
    const second = await querySecondaryOracle(params);
    if (!second)
        return primary;
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
