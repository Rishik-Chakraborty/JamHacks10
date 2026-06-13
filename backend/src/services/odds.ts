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

export interface PayoutInputs {
  side: 'yes' | 'no';
  stakeLamports: number;
  yesPoolLamports: number;
  noPoolLamports: number;
  /** Combined creator + platform fee, represented as 0..1. */
  feeRate?: number;
}

export interface PayoutQuote {
  stakeLamports: number;
  winningPoolLamports: number;
  losingPoolLamports: number;
  grossProfitLamports: number;
  feeLamports: number;
  payoutLamports: number;
  multiplier: number | null;
}

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

/**
 * Quote a parimutuel payout for a winning stake.
 *
 * Formula:
 *   payout = stake + ((stake / winningPool) * losingPool * (1 - feeRate))
 *
 * This mirrors the intended on-chain settlement math while staying side-effect
 * free for API previews, demo bots, and tests.
 */
export function quoteParimutuelPayout({
  side,
  stakeLamports,
  yesPoolLamports,
  noPoolLamports,
  feeRate = 0,
}: PayoutInputs): PayoutQuote {
  const stake = Math.max(0, Math.floor(stakeLamports || 0));
  const yes = Math.max(0, Math.floor(yesPoolLamports || 0));
  const no = Math.max(0, Math.floor(noPoolLamports || 0));
  const fee = Math.max(0, Math.min(1, feeRate || 0));
  const winningPool = side === 'yes' ? yes : no;
  const losingPool = side === 'yes' ? no : yes;

  if (stake === 0 || winningPool === 0) {
    return {
      stakeLamports: stake,
      winningPoolLamports: winningPool,
      losingPoolLamports: losingPool,
      grossProfitLamports: 0,
      feeLamports: 0,
      payoutLamports: stake,
      multiplier: stake > 0 ? 1 : null,
    };
  }

  const grossProfit = Math.floor((stake * losingPool) / winningPool);
  const feeLamports = Math.floor(grossProfit * fee);
  const payout = stake + grossProfit - feeLamports;

  return {
    stakeLamports: stake,
    winningPoolLamports: winningPool,
    losingPoolLamports: losingPool,
    grossProfitLamports: grossProfit,
    feeLamports,
    payoutLamports: payout,
    multiplier: stake > 0 ? payout / stake : null,
  };
}
