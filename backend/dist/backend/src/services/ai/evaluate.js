"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateGoal = evaluateGoal;
/**
 * AI oracle — evaluates the final challenge photo against the success criteria
 * and returns a structured {@link OracleVerdict}. This is the GenAI core of
 * GymCast: it is the authority that decides market resolution.
 *
 * - Primary judge: OpenAI vision model (`env.OPENAI_VISION_MODEL`) via Structured
 *   Outputs (json_schema), so the model is *forced* to return the exact verdict
 *   shape — no brittle free-text parsing.
 * - Optional ensemble: a second opinion from a self-hosted Vultr GPU model
 *   (`env.VULTR_VISION_URL`). If the two judges disagree, we force manual review
 *   and discount confidence. No-op when the flag is unset.
 */
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("openai/helpers/zod");
const zod_2 = require("zod");
const env_1 = require("../../config/env");
const contract_1 = require("../../contract");
const prompts_1 = require("./prompts");
/**
 * Zod schema mirroring {@link OracleVerdict} minus `needsManualReview`, which we
 * compute server-side (the model never decides whether a human is needed).
 * Drives OpenAI Structured Outputs so the model MUST return this exact shape.
 */
const verdictSchema = zod_2.z
    .object({
    met: zod_2.z.boolean().describe('Whether the success criteria is clearly met by the photo.'),
    confidence: zod_2.z
        .number()
        .min(0)
        .max(1)
        .describe('Probability in [0,1] that the `met` verdict is correct. Be conservative.'),
    reasoning: zod_2.z
        .string()
        .describe('Brief justification tied to the observed evidence.'),
    observedEvidence: zod_2.z
        .array(zod_2.z.string())
        .describe('Concrete visual facts actually seen in the photo and used to decide.'),
})
    .strict();
let cachedClient = null;
function client() {
    if (!cachedClient)
        cachedClient = new openai_1.default({ apiKey: env_1.env.OPENAI_API_KEY });
    return cachedClient;
}
/** Build a data URL for the vision message without ever logging the payload. */
function toDataUrl(imageBase64, mimeType) {
    // Accept either a raw base64 string or an already-formed data URL.
    if (imageBase64.startsWith('data:'))
        return imageBase64;
    return `data:${mimeType};base64,${imageBase64}`;
}
function clamp01(n) {
    if (Number.isNaN(n))
        return 0;
    return Math.max(0, Math.min(1, n));
}
/**
 * Evaluate the final photo against the goal's success criteria.
 *
 * @throws if the AI oracle is not configured (`env.aiEnabled` is false).
 */
async function evaluateGoal(params) {
    if (!env_1.env.aiEnabled) {
        throw new Error('AI oracle not configured: set OPENAI_API_KEY to enable verdicts.');
    }
    const dataUrl = toDataUrl(params.imageBase64, params.mimeType);
    const completion = await client().beta.chat.completions.parse({
        model: env_1.env.OPENAI_VISION_MODEL,
        messages: [
            { role: 'system', content: prompts_1.ORACLE_SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'text', text: (0, prompts_1.buildOracleUserText)(params.goalText, params.successCriteria) },
                    { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                ],
            },
        ],
        response_format: (0, zod_1.zodResponseFormat)(verdictSchema, 'oracle_verdict'),
    });
    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
        const refusal = completion.choices[0]?.message.refusal;
        throw new Error(`AI oracle returned no structured verdict${refusal ? `: ${refusal}` : ''}.`);
    }
    let verdict = {
        met: parsed.met,
        confidence: clamp01(parsed.confidence),
        reasoning: parsed.reasoning,
        observedEvidence: parsed.observedEvidence,
        needsManualReview: false,
    };
    // Optional second opinion. Only runs when the Vultr flag is configured.
    verdict = await applyEnsemble(verdict, params);
    // Final gate: low confidence always routes to a human before any payout.
    verdict.needsManualReview = verdict.needsManualReview || verdict.confidence < contract_1.MIN_CONFIDENCE;
    return verdict;
}
/* -------------------------------------------------------------------------- */
/* Optional Vultr GPU ensemble (second opinion)                               */
/* -------------------------------------------------------------------------- */
/**
 * If a self-hosted vision endpoint is configured, get a second verdict and
 * cross-check it against the primary. On disagreement we force manual review
 * and halve confidence; on agreement we leave the primary untouched. Any
 * failure of the secondary is non-fatal — the primary verdict still stands.
 */
async function applyEnsemble(primary, params) {
    if (!env_1.env.VULTR_VISION_URL)
        return primary;
    const second = await querySecondaryOracle(params);
    if (!second)
        return primary; // secondary unreachable/unparseable → trust primary
    if (second.met !== primary.met) {
        // Judges disagree on the binary outcome → never auto-resolve.
        return {
            ...primary,
            confidence: clamp01(Math.min(primary.confidence, second.confidence) * 0.5),
            reasoning: `${primary.reasoning} [Ensemble DISAGREEMENT: secondary judged met=${second.met} (conf ${second.confidence.toFixed(2)}); routed to manual review.]`,
            needsManualReview: true,
        };
    }
    // Agreement: keep the more conservative confidence, note the corroboration.
    return {
        ...primary,
        confidence: clamp01(Math.min(primary.confidence, second.confidence)),
        reasoning: `${primary.reasoning} [Ensemble agreement: secondary also judged met=${second.met}.]`,
    };
}
/** Minimal shape we accept from the Vultr endpoint. */
const secondarySchema = zod_2.z.object({
    met: zod_2.z.boolean(),
    confidence: zod_2.z.number(),
});
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
                    imageBase64: params.imageBase64,
                    mimeType: params.mimeType,
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
            console.warn('[ai] Vultr ensemble returned an unparseable verdict; ignoring.');
            return null;
        }
        return { met: parsed.data.met, confidence: clamp01(parsed.data.confidence) };
    }
    catch (err) {
        console.warn('[ai] Vultr ensemble request failed; ignoring second opinion.', err);
        return null;
    }
}
