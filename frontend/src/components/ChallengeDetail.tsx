'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChallengeDetail as ChallengeDetailType } from '@/types/contract';
import { api } from '@/lib/api';
import { onHype } from '@/lib/socket';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';
import { Stat } from '@/components/ui/Stat';
import { OddsBar } from '@/components/ui/OddsBar';
import { formatSol, shortWallet, formatDate, timeUntil } from '@/lib/format';
import { HypeMeter } from '@/components/HypeMeter';
import { ProgressChart } from '@/components/ProgressChart';
import { BetModule } from '@/components/BetModule';
import { ClaimButton } from '@/components/ClaimButton';
import { PhotoUpload } from '@/components/PhotoUpload';
import { PhotoGallery } from '@/components/PhotoGallery';

/** Tale-of-the-tape meta cell: tracked micro-label over a value. */
function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 first:pl-0">
      <div className="label">{label}</div>
      <div className="text-sm text-ink mt-1">{children}</div>
    </div>
  );
}

export function ChallengeDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const queryKey = ['challenge', id] as const;

  const { data, isLoading, isError, error, refetch } = useQuery<ChallengeDetailType>({
    queryKey,
    queryFn: () => api.getChallenge(id),
  });

  // Live hype/odds updates merged into the cached challenge.
  useEffect(() => {
    const off = onHype(id, (u) => {
      qc.setQueryData<ChallengeDetailType>(queryKey, (prev) =>
        prev
          ? {
              ...prev,
              hypeScore: u.hypeScore,
              streak: u.streak,
              misses: u.misses,
              odds: u.odds,
              yesPoolLamports: u.odds.yesPoolLamports,
              noPoolLamports: u.odds.noPoolLamports,
              impliedYes: u.odds.impliedYes,
            }
          : prev,
      );
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="h-10 w-2/3 bg-paper-2 animate-pulse" />
        <div className="h-4 w-1/2 bg-paper-2 animate-pulse mt-3" />
        <div className="grid lg:grid-cols-[1fr_22rem] gap-8 mt-8">
          <div className="h-96 bg-card border border-line animate-pulse" />
          <div className="h-96 bg-card border border-line animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="border border-no bg-no-soft p-6">
          <p className="display text-xl text-no">Couldn’t load this challenge</p>
          <p className="text-sm text-ink-2 mt-1">
            {error instanceof Error ? error.message : 'Request failed.'}
          </p>
          <button onClick={() => refetch()} className="label mt-3 underline hover:text-no">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="border border-line bg-card p-10 text-center">
          <p className="display text-2xl text-ink">Line not found</p>
          <p className="text-sm text-muted mt-2">
            This challenge may have closed.{' '}
            <Link href="/" className="underline hover:text-accent">
              Back to the board
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const c = data;
  const total = c.yesPoolLamports + c.noPoolLamports;
  const { text: closes, ended } = timeUntil(c.deadline);
  const resolved = c.status === 'resolved';

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <Link href="/" className="label hover:text-accent">
        ← The Board
      </Link>

      {/* HEADER band */}
      <header className="mt-4 rule-accent pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="display text-5xl sm:text-6xl text-ink">{c.title}</h1>
            <p className="text-ink-2 mt-2 max-w-2xl">{c.goalText}</p>
          </div>
          {resolved ? (
            <Tag tone={c.outcome === 'yes' ? 'yes' : 'no'} solid className="shrink-0">
              Settled {c.outcome ?? ''}
            </Tag>
          ) : (
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="live-tick" />
              <span className="label text-ink">Open</span>
            </span>
          )}
        </div>

        {/* Tale of the tape */}
        <div className="flex flex-wrap divide-x divide-line border-t border-line mt-5 pt-4">
          <MetaCell label="Creator">
            <span className="num">{shortWallet(c.creatorWallet)}</span>
          </MetaCell>
          <MetaCell label="Opened">
            <span className="num">{formatDate(c.startDate)}</span>
          </MetaCell>
          <MetaCell label="Closes">
            <span className={`num ${ended && !resolved ? 'text-accent' : ''}`}>
              {resolved ? 'Closed' : closes}
            </span>
          </MetaCell>
          {c.metricUnit && (
            <MetaCell label="Metric">
              <span className="num uppercase">{c.metricUnit}</span>
            </MetaCell>
          )}
        </div>

        {/* Winning condition aside */}
        <aside className="border border-ink bg-paper-2 p-4 mt-5">
          <div className="label text-ink">Winning Condition</div>
          <p className="text-sm text-ink-2 mt-2">{c.successCriteria}</p>
        </aside>
      </header>

      {/* Two-column body */}
      <div className="grid lg:grid-cols-[1fr_22rem] gap-8 mt-8 items-start">
        {/* LEFT */}
        <div className="space-y-8">
          <HypeMeter hypeScore={c.hypeScore} streak={c.streak} misses={c.misses} />
          <ProgressChart metrics={c.metrics} unit={c.metricUnit} />
          <PhotoUpload challenge={c} />
          <PhotoGallery photos={c.photos} />
        </div>

        {/* RIGHT — market panel */}
        <aside className="lg:sticky lg:top-6">
          <Panel className="p-5">
            <h2 className="display text-2xl text-ink">The Market</h2>
            <div className="rule-ink mt-2 pt-4">
              <OddsBar impliedYes={c.impliedYes} labeled height={12} />
            </div>

            <div className="grid grid-cols-3 gap-px bg-line border border-line mt-5">
              <Stat className="bg-card p-3" label="Yes pool" value={formatSol(c.yesPoolLamports)} tone="yes" hint="SOL" />
              <Stat className="bg-card p-3" label="No pool" value={formatSol(c.noPoolLamports)} tone="no" hint="SOL" />
              <Stat className="bg-card p-3" label="Total" value={formatSol(total)} hint="SOL" />
            </div>

            <div className="grid grid-cols-2 gap-px bg-line border border-line border-t-0 mt-px">
              <Stat
                className="bg-card p-3"
                label="Yes payout"
                value={c.odds.yesMultiplier != null ? `${c.odds.yesMultiplier.toFixed(2)}×` : '—'}
                tone="yes"
              />
              <Stat
                className="bg-card p-3"
                label="No payout"
                value={c.odds.noMultiplier != null ? `${c.odds.noMultiplier.toFixed(2)}×` : '—'}
                tone="no"
              />
            </div>

            <BetModule challenge={c} odds={c.odds} />
            <ClaimButton challenge={c} />

            {/* Recent bets */}
            <div className="rule pt-4 mt-4">
              <h3 className="label text-ink">Recent bets</h3>
              {c.recentBets.length === 0 ? (
                <p className="text-sm text-muted mt-2">No bets on the board yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {c.recentBets.map((b) => (
                    <li key={b.id} className="flex items-center justify-between py-2">
                      <span className="num text-sm text-ink-2">{shortWallet(b.bettorWallet)}</span>
                      <span className="flex items-center gap-2">
                        <Tag tone={b.side === 'yes' ? 'yes' : 'no'}>{b.side}</Tag>
                        <span className="num text-sm text-ink">
                          {formatSol(b.amountLamports)} <span className="text-faint">SOL</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
