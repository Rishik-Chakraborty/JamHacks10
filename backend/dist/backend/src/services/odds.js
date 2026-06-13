"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeOdds = computeOdds;
/**
 * Compute the full {@link Odds} shape from raw pool sizes.
 * @param yesPoolLamports total lamports staked on YES (>= 0)
 * @param noPoolLamports  total lamports staked on NO (>= 0)
 */
function computeOdds(yesPoolLamports, noPoolLamports) {
    const yes = Math.max(0, yesPoolLamports || 0);
    const no = Math.max(0, noPoolLamports || 0);
    const total = yes + no;
    // Implied prob = pool share. Empty market → neutral 0.5/0.5.
    const impliedYes = total > 0 ? yes / total : 0.5;
    const impliedNo = total > 0 ? no / total : 0.5;
    // Gross multiplier = total / winning pool. null if that side has no stake.
    const yesMultiplier = yes > 0 ? total / yes : null;
    const noMultiplier = no > 0 ? total / no : null;
    return {
        yesPoolLamports: yes,
        noPoolLamports: no,
        totalLamports: total,
        impliedYes,
        impliedNo,
        yesMultiplier,
        noMultiplier,
        hasMarket: yes > 0 && no > 0,
    };
}
