/**
 * Parimutuel settlement math — the web2 mirror of the on-chain claim_winnings.
 *
 * Winners reclaim their stake plus a proportional share of the losing pool,
 * AFTER the creator (influencer) cut and platform fee are skimmed off the
 * losing pool. One-sided / no-winner markets refund every stake and take no fee.
 *
 * Keep this in lockstep with the Anchor program's resolve/claim math so the
 * displayed numbers match what the chain actually pays out.
 */
import type { Challenge, Bet, Settlement, BetSide } from '../contract';
import { DEFAULT_CREATOR_FEE_BPS, DEFAULT_PLATFORM_FEE_BPS } from '../contract';

const BPS_DENOM = 10_000;

/** Compute the settlement split for a resolved line. Returns null if unresolved. */
export function computeSettlement(c: Pick<Challenge, 'outcome' | 'yesPoolLamports' | 'noPoolLamports' | 'creatorFeeBps' | 'platformFeeBps'>): Settlement | null {
  if (c.outcome !== 'yes' && c.outcome !== 'no') return null;

  const outcome = c.outcome as BetSide;
  const winningPool = outcome === 'yes' ? c.yesPoolLamports : c.noPoolLamports;
  const losingPool = outcome === 'yes' ? c.noPoolLamports : c.yesPoolLamports;
  const total = winningPool + losingPool;

  // No counterparty (one-sided) or no winners → refund everyone, no fees.
  const refunded = winningPool === 0 || losingPool === 0;

  const creatorBps = c.creatorFeeBps ?? DEFAULT_CREATOR_FEE_BPS;
  const platformBps = c.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;

  const creatorPayout = refunded ? 0 : Math.floor((losingPool * creatorBps) / BPS_DENOM);
  const platformPayout = refunded ? 0 : Math.floor((losingPool * platformBps) / BPS_DENOM);
  const distributable = refunded ? 0 : losingPool - creatorPayout - platformPayout;

  return {
    outcome,
    totalPoolLamports: total,
    winningPoolLamports: winningPool,
    losingPoolLamports: losingPool,
    creatorPayoutLamports: creatorPayout,
    platformPayoutLamports: platformPayout,
    distributableLamports: distributable,
    refunded,
  };
}

/** Realized payout for a single bet on a resolved line. */
export function computeBetPayout(
  c: Pick<Challenge, 'outcome' | 'yesPoolLamports' | 'noPoolLamports' | 'creatorFeeBps' | 'platformFeeBps'>,
  bet: Pick<Bet, 'side' | 'amountLamports'>,
): { won: boolean; refunded: boolean; payoutLamports: number } | null {
  const s = computeSettlement(c);
  if (!s) return null;

  if (s.refunded) {
    return { won: false, refunded: true, payoutLamports: bet.amountLamports };
  }
  if (bet.side !== s.outcome) {
    return { won: false, refunded: false, payoutLamports: 0 };
  }
  const share = s.winningPoolLamports > 0
    ? Math.floor((bet.amountLamports * s.distributableLamports) / s.winningPoolLamports)
    : 0;
  return { won: true, refunded: false, payoutLamports: bet.amountLamports + share };
}
