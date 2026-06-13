/**
 * Hype Meter scoring.
 *
 * The Hype score is a 0..100 (lightly uncapped) engagement signal that rewards
 * consistency + recent betting volume and penalizes missed posting days.
 *
 * Formula (all inputs default to 0):
 *   base        = 30                       baseline so an active market isn't dead-flat
 *   streakBonus = streak * 8               reward consecutive on-time posts
 *   volumeBonus = log1p(betCountRecent) * 14  recent bet volume, diminishing returns
 *   momentumBonus = momentum * 20          caller-supplied [-1..1] price/flow momentum
 *   missPenalty = misses * 12              punish skipped days
 *
 *   hype = base + streakBonus + volumeBonus + momentumBonus - missPenalty
 *
 * Result is clamped to [0, 100]. The log on volume keeps a betting frenzy from
 * pinning the meter while still moving it meaningfully off the first few bets.
 */
import type { Challenge, HypeUpdate, Odds } from '../contract';

export interface HypeInputs {
  /** Consecutive on-time posting days. */
  streak: number;
  /** Missed posting days. */
  misses: number;
  /** Number of bets placed in the recent window. */
  betCountRecent: number;
  /** Optional directional momentum in [-1, 1] (e.g. recent odds drift). */
  momentum?: number;
}

const HYPE_BASE = 30;
const STREAK_WEIGHT = 8;
const VOLUME_WEIGHT = 14;
const MOMENTUM_WEIGHT = 20;
const MISS_WEIGHT = 12;

/** Compute a clamped 0..100 hype score from engagement signals. */
export function computeHype({ streak, misses, betCountRecent, momentum = 0 }: HypeInputs): number {
  const s = Math.max(0, streak || 0);
  const m = Math.max(0, misses || 0);
  const v = Math.max(0, betCountRecent || 0);
  const mo = Math.max(-1, Math.min(1, momentum || 0));

  const raw =
    HYPE_BASE +
    s * STREAK_WEIGHT +
    Math.log1p(v) * VOLUME_WEIGHT +
    mo * MOMENTUM_WEIGHT -
    m * MISS_WEIGHT;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Build a {@link HypeUpdate} socket payload from a challenge doc + freshly
 * computed odds. Recomputes the hype score from the challenge's current
 * streak/misses; volume defaults to 0 unless the caller has a recent count.
 */
export function buildHypeUpdate(
  challenge: Pick<Challenge, 'id' | 'streak' | 'misses'> & { betCountRecent?: number; momentum?: number },
  odds: Odds,
): HypeUpdate {
  const hypeScore = computeHype({
    streak: challenge.streak,
    misses: challenge.misses,
    betCountRecent: challenge.betCountRecent ?? 0,
    momentum: challenge.momentum ?? 0,
  });

  return {
    challengeId: challenge.id,
    hypeScore,
    streak: challenge.streak ?? 0,
    misses: challenge.misses ?? 0,
    odds,
  };
}
