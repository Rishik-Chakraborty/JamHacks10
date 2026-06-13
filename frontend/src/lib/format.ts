/** Small display formatters shared across the UI. */
import { LAMPORTS_PER_SOL } from '@/types/contract';

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/** e.g. 2500000000 -> "2.5" (trims trailing zeros, max 3 dp). */
export function formatSol(lamports: number): string {
  const sol = lamportsToSol(lamports);
  return sol.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** 7gym…wXy */
export function shortWallet(wallet: string, lead = 4, tail = 4): string {
  if (!wallet || wallet.length <= lead + tail + 1) return wallet;
  return `${wallet.slice(0, lead)}…${wallet.slice(-tail)}`;
}

export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Compact countdown to an ISO deadline, e.g. "12d 4h", "3h 20m", "ended". */
export function timeUntil(iso: string, now = Date.now()): { text: string; ended: boolean } {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { text: 'ended', ended: true };
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return { text: `${d}d ${h}h`, ended: false };
  if (h > 0) return { text: `${h}h ${m}m`, ended: false };
  return { text: `${m}m`, ended: false };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
