/**
 * AI play-by-play commentary for the live activity ticker. Cheap, plain-text
 * one-liners reacting to bets / photo posts / resolutions using a small fast
 * model (`env.OPENAI_COMMENTARY_MODEL`, e.g. gpt-4o). Non-critical: if the AI is
 * disabled or the call fails, we return '' so callers can skip the ticker line.
 */
import OpenAI from 'openai';

import { env } from '../../config/env';
import type { TickerEvent } from '../../contract';
import { COMMENTARY_SYSTEM_PROMPT } from './prompts';
import { LAMPORTS_PER_SOL } from '../../contract';

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

/** Render the event into a compact human description for the model. */
function describeEvent(event: TickerEvent): string {
  const parts: string[] = [`kind=${event.kind}`];
  if (event.challengeTitle) parts.push(`challenge="${event.challengeTitle}"`);
  if (event.wallet) parts.push(`wallet=${event.wallet.slice(0, 4)}…${event.wallet.slice(-4)}`);
  if (event.side) parts.push(`side=${event.side.toUpperCase()}`);
  if (typeof event.amountLamports === 'number') {
    parts.push(`amount=${(event.amountLamports / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  }
  if (event.message) parts.push(`note="${event.message}"`);
  return parts.join(' ');
}

/**
 * Generate a short, funny ticker line for a bet/photo/resolve event.
 * Returns '' when the AI oracle is not configured or the call fails — this is a
 * flavor feature and must never break the realtime pipeline.
 */
export async function generateCommentary(event: TickerEvent): Promise<string> {
  if (!env.aiEnabled) return '';

  try {
    const completion = await client().chat.completions.create({
      model: env.OPENAI_COMMENTARY_MODEL,
      max_tokens: 60,
      temperature: 0.9,
      messages: [
        { role: 'system', content: COMMENTARY_SYSTEM_PROMPT },
        { role: 'user', content: `Event: ${describeEvent(event)}` },
      ],
    });

    const line = completion.choices[0]?.message.content?.trim() ?? '';
    // Strip wrapping quotes the model sometimes adds and collapse to one line.
    return line.replace(/^["']|["']$/g, '').replace(/\s*\n\s*/g, ' ').trim();
  } catch (err) {
    console.warn('[ai] commentary generation failed; emitting no line.', err);
    return '';
  }
}
