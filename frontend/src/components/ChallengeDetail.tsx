/**
 * ChallengeDetail — client view for a single challenge.
 *
 * - Loads the full ChallengeDetail via TanStack Query (api.getChallenge).
 * - Subscribes to the per-challenge Hype socket room (onHype) and merges live
 *   hypeScore / streak / misses / odds back into the query cache so every child
 *   (HypeMeter, market panel, BetModule) reflects realtime updates.
 * - Layout: header (title/goal/criteria/deadline/status); left column =
 *   progress chart + photo gallery (+ creator upload); right column = market
 *   panel mounting <BetModule/> and <ClaimButton/> (owned by the Bet agent).
 */
'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, CalendarClock, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { HypeMeter } from '@/components/HypeMeter';
import { ProgressChart } from '@/components/ProgressChart';
import { PhotoGallery } from '@/components/PhotoGallery';
import { PhotoUpload } from '@/components/PhotoUpload';
import { CommentsPanel } from '@/components/CommentsPanel';
import { BetModule } from '@/components/BetModule';
import { ClaimButton } from '@/components/ClaimButton';
import { api } from '@/lib/api';
import { onHype } from '@/lib/socket';
import { PROGRAM_ID_STR } from '@/lib/anchor';
import { LAMPORTS_PER_SOL, type ChallengeDetail as ChallengeDetailDto } from '@/types/contract';

export interface ChallengeDetailProps {
  id: string;
}

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function fmtDate(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function deadlineHint(deadline: string, status: string): string {
  if (status === 'resolved') return 'Resolved';
  const ms = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'Deadline passed — awaiting resolution';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

export function ChallengeDetail({ id }: ChallengeDetailProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['challenge', id],
    queryFn: () => api.getChallenge(id),
    refetchOnWindowFocus: false,
  });

  // Live hype/odds updates → merge into the cached ChallengeDetail.
  useEffect(() => {
    const off = onHype(id, (u) => {
      queryClient.setQueryData<ChallengeDetailDto>(['challenge', id], (prev) =>
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
  }, [id, queryClient]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center text-muted sm:px-6">
        Loading challenge…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <Card className="flex items-center gap-3 p-6 text-no">
          <AlertTriangle className="h-5 w-5" />
          {error instanceof Error ? error.message : 'Challenge not found.'}
        </Card>
      </div>
    );
  }

  const c = data;
  const resolved = c.status === 'resolved';
  const marketLive = !!PROGRAM_ID_STR && !!c.marketPda;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{c.metricType}</Badge>
          {resolved ? (
            <Badge tone={c.outcome === 'yes' ? 'yes' : c.outcome === 'no' ? 'no' : 'neutral'}>
              {c.outcome ? `Resolved · ${c.outcome.toUpperCase()}` : 'Resolved'}
            </Badge>
          ) : (
            <Badge tone="accent" pulse>
              Active
            </Badge>
          )}
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{c.title}</h1>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2 text-sm">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span className="text-foreground">{c.goalText}</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span className="text-muted">{c.successCriteria}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4" />
            Deadline {fmtDate(c.deadline)}
          </span>
          <Badge tone={resolved ? 'neutral' : 'warn'}>{deadlineHint(c.deadline, c.status)}</Badge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left: progress + photos */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-4">
            <HypeMeter hypeScore={c.hypeScore} streak={c.streak} misses={c.misses} />
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Progress</h2>
            <ProgressChart metrics={c.metrics} metricType={c.metricType} />
          </Card>

          <PhotoUpload challenge={c} />

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Photos</h2>
            <PhotoGallery photos={c.photos} />
          </Card>

          <CommentsPanel challengeId={c.id} comments={c.comments} />
        </div>

        {/* Right: market panel */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-4">
            <h2 className="text-sm font-semibold">Market</h2>

            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="YES pool"
                tone="yes"
                value={`${sol(c.odds.yesPoolLamports)} SOL`}
                hint={`${Math.round(c.odds.impliedYes * 100)}% implied`}
              />
              <Stat
                label="NO pool"
                tone="no"
                value={`${sol(c.odds.noPoolLamports)} SOL`}
                hint={`${Math.round(c.odds.impliedNo * 100)}% implied`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="YES payout"
                value={c.odds.yesMultiplier ? `${c.odds.yesMultiplier.toFixed(2)}x` : '—'}
              />
              <Stat
                label="NO payout"
                value={c.odds.noMultiplier ? `${c.odds.noMultiplier.toFixed(2)}x` : '—'}
              />
            </div>

            {!marketLive && (
              <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                {PROGRAM_ID_STR
                  ? 'Market not live yet — the creator needs to initialize it on-chain.'
                  : 'On-chain market disabled — deploy the program and set NEXT_PUBLIC_PROGRAM_ID first.'}
              </p>
            )}

            {/* Mounted from the Bet Module agent. They handle disabled/degraded states. */}
            <BetModule challenge={c} odds={c.odds} />
            <ClaimButton challenge={c} />
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">Recent bets</h2>
            {c.recentBets.length === 0 ? (
              <p className="text-sm text-muted">No bets yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.recentBets.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone={b.side === 'yes' ? 'yes' : 'no'}>{b.side.toUpperCase()}</Badge>
                      <span className="font-mono text-muted">
                        {b.bettorWallet.slice(0, 4)}…{b.bettorWallet.slice(-4)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{sol(b.amountLamports)} SOL</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
