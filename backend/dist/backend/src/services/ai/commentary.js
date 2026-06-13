"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCommentary = generateCommentary;
/**
 * AI play-by-play commentary for the live activity ticker. Cheap, plain-text
 * one-liners reacting to bets / photo posts / resolutions using a small fast
 * model (`env.OPENAI_COMMENTARY_MODEL`, e.g. gpt-4o). Non-critical: if the AI is
 * disabled or the call fails, we return '' so callers can skip the ticker line.
 */
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
const prompts_1 = require("./prompts");
const contract_1 = require("../../contract");
let cachedClient = null;
function client() {
    if (!cachedClient)
        cachedClient = new openai_1.default({ apiKey: env_1.env.OPENAI_API_KEY });
    return cachedClient;
}
/** Render the event into a compact human description for the model. */
function describeEvent(event) {
    const parts = [`kind=${event.kind}`];
    if (event.challengeTitle)
        parts.push(`challenge="${event.challengeTitle}"`);
    if (event.wallet)
        parts.push(`wallet=${event.wallet.slice(0, 4)}…${event.wallet.slice(-4)}`);
    if (event.side)
        parts.push(`side=${event.side.toUpperCase()}`);
    if (typeof event.amountLamports === 'number') {
        parts.push(`amount=${(event.amountLamports / contract_1.LAMPORTS_PER_SOL).toFixed(2)} SOL`);
    }
    if (event.message)
        parts.push(`note="${event.message}"`);
    return parts.join(' ');
}
/**
 * Generate a short, funny ticker line for a bet/photo/resolve event.
 * Returns '' when the AI oracle is not configured or the call fails — this is a
 * flavor feature and must never break the realtime pipeline.
 */
async function generateCommentary(event) {
    if (!env_1.env.aiEnabled)
        return '';
    try {
        const completion = await client().chat.completions.create({
            model: env_1.env.OPENAI_COMMENTARY_MODEL,
            max_tokens: 60,
            temperature: 0.9,
            messages: [
                { role: 'system', content: prompts_1.COMMENTARY_SYSTEM_PROMPT },
                { role: 'user', content: `Event: ${describeEvent(event)}` },
            ],
        });
        const line = completion.choices[0]?.message.content?.trim() ?? '';
        // Strip wrapping quotes the model sometimes adds and collapse to one line.
        return line.replace(/^["']|["']$/g, '').replace(/\s*\n\s*/g, ' ').trim();
    }
    catch (err) {
        console.warn('[ai] commentary generation failed; emitting no line.', err);
        return '';
    }
}
