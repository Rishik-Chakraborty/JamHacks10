'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import { formatSol, formatPct } from '@/lib/format';
import type { PortfolioPosition, Challenge, Bet, BetSide } from '@/types/contract';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { Stat } from '@/components/ui/Stat';
import { claimWinnings, MarketClientError } from '@/lib/market';

// Wallet button is browser-only — load client-side to avoid hydration mismatch.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

type PositionStatus = 'open' | 'won' | 'lost' | 'refunded';

function statusOf(c: Challenge, b: Bet, pos: PortfolioPosition): PositionStatus {
  if (c.status === 'refunded' || pos.refunded) return 'refunded';
  if (c.status !== 'resolved') return 'open'; // pending_accept / active / under_review / disputed
  return (pos.won ?? c.outcome === b.side) ? 'won' : 'lost';
}

/**
 * Estimated parimutuel payout for an OPEN position, in lamports:
 *   stake + stake * (losingPool / winningPool)
 * where the winning pool is the side the bet is on. Guards divide-by-zero —
 * returns null when the bettor's own side pool is empty (no defined share).
 */
function estimatePayout(c: Challenge, b: Bet): number | null {
  const winningPool = b.side === 'yes' ? c.yesPoolLamports : c.noPoolLamports;
  const losingPool = b.side === 'yes' ? c.noPoolLamports : c.yesPoolLamports;
  if (winningPool <= 0) return null;
  return b.amountLamports + b.amountLamports * (losingPool / winningPool);
}

export function PortfolioView() {
  const { connected, publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  if (!connected || !wallet) {
    return (
      <Panel className="p-8 max-w-2xl">
        <p className="label">Your Account</p>
        <h2 className="display text-3xl text-ink mt-2">Connect your wallet to see your positions</h2>
        <p className="text-sm text-ink-2 mt-2 max-w-md leading-relaxed">
          Your wallet is your account — there&rsquo;s no signup. Connect to pull up every line
          you&rsquo;ve backed, your live odds, and any winnings waiting to be claimed.
        </p>
        <div className="mt-5">
          <WalletMultiButton />
        </div>
      </Panel>
    );
  }

  return <Positions wallet={wallet} />;
}

function Positions({ wallet }: { wallet: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<PortfolioPosition[]>({
    queryKey: ['positions', wallet],
    queryFn: () => api.getPositions(wallet),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card h-20 animate-pulse" />
          ))}
        </div>
        <div className="mt-8 border border-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card h-16 border-b border-line last:border-b-0 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-no bg-no-soft p-6 max-w-2xl">
        <p className="display text-xl text-no">Couldn&rsquo;t load your bets</p>
        <p className="text-sm text-ink-2 mt-1">
          {error instanceof Error ? error.message : 'Request failed.'} Is the API running at{' '}
          <code className="num">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'}</code>?
        </p>
        <button onClick={() => refetch()} className="label mt-3 underline hover:text-no">
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="border border-line bg-card p-10 text-center max-w-2xl mx-auto">
        <p className="display text-2xl text-ink">No positions yet</p>
        <p className="text-sm text-muted mt-2">You haven&rsquo;t backed a line yet.</p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center px-6 bg-accent text-paper border border-accent font-display uppercase tracking-wide hover:bg-accent-deep transition-colors"
          >
            Back a line on the Board
          </Link>
        </div>
      </div>
    );
  }

  // ---- Summary roll-up -----------------------------------------------------
  const totalStaked = data.reduce((sum, p) => sum + p.bet.amountLamports, 0);
  let open = 0;
  let won = 0;
  let lost = 0;
  for (const p of data) {
    const s = statusOf(p.challenge, p.bet, p);
    if (s === 'open') open += 1;
    else if (s === 'won') won += 1;
    else if (s === 'lost') lost += 1;
  }

  return (
    <div>
      {/* Summary header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line">
        <Stat
          className="bg-card p-4"
          label="Total Staked"
          value={
            <>
              {formatSol(totalStaked)} <span className="text-faint text-sm">SOL</span>
            </>
          }
          hint={`${data.length} position${data.length === 1 ? '' : 's'}`}
        />
        <Stat className="bg-card p-4" label="Open" value={open} tone="accent" />
        <Stat className="bg-card p-4" label="Won" value={won} tone="yes" />
        <Stat className="bg-card p-4" label="Lost" value={lost} tone="no" />
      </div>

      {/* Positions ledger */}
      <div className="mt-8">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3">
          <h2 className="display text-2xl sm:text-3xl text-ink">The Ledger</h2>
          <span className="label hidden sm:block">Your Positions</span>
        </div>

        {/* Column header — desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 border-b border-line">
          <div className="col-span-6 label">Market</div>
          <div className="col-span-1 label">Side</div>
          <div className="col-span-2 label text-right">Stake</div>
          <div className="col-span-3 label text-right">Status</div>
        </div>

        <div className="border-x border-b border-line md:border-x md:border-b">
          {data.map((p) => (
            <PositionRow key={p.bet.id} position={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PositionRow({ position }: { position: PortfolioPosition }) {
  const { challenge: c, bet: b } = position;
  const status = statusOf(c, b, position);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center px-4 py-4 border-b border-line last:border-b-0">
      {/* Market */}
      <div className="md:col-span-6 min-w-0">
        <Link href={`/challenge/${c.id}`} className="group block">
          <h3 className="display text-lg text-ink leading-tight group-hover:text-accent transition-colors">
            {c.title}
          </h3>
        </Link>
      </div>

      {/* Side */}
      <div className="md:col-span-1">
        <Tag tone={b.side === 'yes' ? 'yes' : 'no'} solid>
          {b.side.toUpperCase()}
        </Tag>
      </div>

      {/* Stake */}
      <div className="md:col-span-2 md:text-right">
        <span className="md:hidden label mr-2">Stake</span>
        <span className="num text-base text-ink">{formatSol(b.amountLamports)}</span>{' '}
        <span className="text-faint text-xs num">SOL</span>
      </div>

      {/* Status */}
      <div className="md:col-span-3 md:text-right">
        {status === 'open' ? (
          <OpenStatus position={position} />
        ) : status === 'won' ? (
          <WonStatus position={position} />
        ) : status === 'refunded' ? (
          <div className="md:flex md:flex-col md:items-end">
            <Tag tone="muted" solid>Refunded</Tag>
            <span className="text-xs text-muted mt-1">
              Stake back <span className="num text-ink">{formatSol(position.payoutLamports ?? b.amountLamports)} SOL</span>
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center md:justify-end">
            <Tag tone="no" solid>
              Lost
            </Tag>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenStatus({ position }: { position: PortfolioPosition }) {
  const { challenge: c, bet: b } = position;
  const implied = b.side === 'yes' ? c.impliedYes : 1 - c.impliedYes;
  const payout = estimatePayout(c, b);

  return (
    <div className="md:flex md:flex-col md:items-end">
      <span className="inline-flex items-center gap-1.5">
        <span className="live-tick" />
        <span className="label text-ink">Open</span>
      </span>
      <div className="text-xs text-muted mt-1">
        Implied{' '}
        <span className={`num ${b.side === 'yes' ? 'text-yes' : 'text-no'}`}>{formatPct(implied)}</span>
        {' · '}
        Est. payout{' '}
        <span className="num text-ink">
          {payout != null ? `${formatSol(payout)} SOL` : '—'}
        </span>
      </div>
    </div>
  );
}

function WonStatus({ position }: { position: PortfolioPosition }) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { challenge: c, bet: b } = position;

  const [pending, setPending] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const programReady = Boolean(process.env.NEXT_PUBLIC_PROGRAM_ID);
  const marketReady = Boolean(c.marketPda);
  // Only a real on-chain place_bet created an on-chain Position to claim against.
  // Web2 + seed bets use synthetic tx ids and have no on-chain position.
  const isOnChainBet = !b.txSig.startsWith('web2_') && !b.txSig.startsWith('seed_');
  const claimable = !b.claimed && programReady && marketReady && isOnChainBet;

  async function onClaim() {
    if (!c.marketPda) return;
    setErr(null);
    setSig(null);
    setPending(true);
    try {
      const res = await claimWinnings({
        connection,
        wallet: anchorWallet,
        marketPda: c.marketPda,
      });
      setSig(res.txSig);
    } catch (e) {
      setErr(e instanceof MarketClientError || e instanceof Error ? e.message : 'Claim failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="md:flex md:flex-col md:items-end gap-2">
      <div className="flex items-center gap-2 md:justify-end">
        <Tag tone="yes" solid>
          Won
        </Tag>
        {position.payoutLamports != null && (
          <span className="text-xs text-muted">
            Payout <span className="num text-yes">{formatSol(position.payoutLamports)} SOL</span>
          </span>
        )}
        {b.claimed ? (
          <span className="label tracking-normal text-yes">Claimed</span>
        ) : claimable ? (
          <Button variant="accent" size="sm" onClick={onClaim} disabled={pending}>
            {pending ? 'Claiming…' : 'Claim'}
          </Button>
        ) : !isOnChainBet ? (
          <span className="text-xs text-faint">Off-chain bet — paid out automatically</span>
        ) : (
          <span className="text-xs text-faint">
            {!programReady || !marketReady ? 'On-chain market unavailable' : 'Nothing to claim'}
          </span>
        )}
      </div>
      {sig && (
        <p className="text-xs text-yes mt-1">
          Claimed.{' '}
          <a className="num underline hover:text-accent" href={EXPLORER(sig)} target="_blank" rel="noreferrer">
            View on Explorer
          </a>
        </p>
      )}
      {err && <p className="text-xs text-no mt-1">{err}</p>}
    </div>
  );
}
