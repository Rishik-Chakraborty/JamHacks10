"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHype = computeHype;
exports.buildHypeUpdate = buildHypeUpdate;
const HYPE_BASE = 30;
const STREAK_WEIGHT = 8;
const VOLUME_WEIGHT = 14;
const MOMENTUM_WEIGHT = 20;
const MISS_WEIGHT = 12;
/** Compute a clamped 0..100 hype score from engagement signals. */
function computeHype({ streak, misses, betCountRecent, momentum = 0 }) {
    const s = Math.max(0, streak || 0);
    const m = Math.max(0, misses || 0);
    const v = Math.max(0, betCountRecent || 0);
    const mo = Math.max(-1, Math.min(1, momentum || 0));
    const raw = HYPE_BASE +
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
function buildHypeUpdate(challenge, odds) {
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
