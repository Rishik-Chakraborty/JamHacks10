/**
 * Parimutuel odds engine — pure functions.
 *
 * Given the YES/NO pool sizes (in lamports) we derive the live market state:
 *  - implied probabilities = each side's share of the total pool
 *  - gross payout multiplier per winning lamport = total / winning pool
 *    (a winner reclaims their stake plus a proportional cut of the losing pool;
 *     this is the pre-fee gross multiple, hence total / pool). null if that side
 *     is empty (no winning stake → multiplier undefined).
 *  - hasMarket = both sides have stake (a real two-sided market exists)
 *
 * All divisions guard against a zero denominator so a fresh/one-sided market
 * returns sane neutral values instead of NaN/Infinity.
 */
import type { Odds } from '../contract';

/**
 * Compute the full {@link Odds} shape from raw pool sizes.
 * @param yesPoolLamports total lamports staked on YES (>= 0)
 * @param noPoolLamports  total lamports staked on NO (>= 0)
 */
export function computeOdds(yesPoolLamports: number, noPoolLamports: number): Odds {
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
