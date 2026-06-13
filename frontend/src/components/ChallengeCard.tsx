/**
 * ChallengeCard — a single live market tile in the feed.
 *
 * Shows the goal, creator (shortened wallet), a deadline countdown, the YES/NO
 * implied-odds bar (from `challenge.impliedYes`), the pool total in SOL, plus
 * hype + streak. Entire card links to /challenge/[id].
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Flame, Trophy, Users, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Stat } from '@/components/ui/Stat';
import { LAMPORTS_PER_SOL, type Challenge } from '@/types/contract';

function shortWallet(wallet: string): string {
  if (!wallet) return '—';
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function formatSol(lamports: number): string {
  const sol = (lamports ?? 0) / LAMPORTS_PER_SOL;
  if (sol === 0) return '0';
  if (sol < 0.001) return sol.toExponential(1);
  if (sol < 1) return sol.toFixed(3);
  return sol.toFixed(2);
}

/** Human countdown to a deadline; reactive so it ticks down on screen. */
function useCountdown(deadlineIso: string): { label: string; ended: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(deadlineIso).getTime();
  if (Number.isNaN(target)) return { label: 'no deadline', ended: false };
  const diff = target - now;
  if (diff <= 0) return { label: 'ended', ended: true };

  const mins = Math.floor(diff / 60_000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  const remMins = mins % 60;

  if (days > 0) return { label: `${days}d ${hours}h left`, ended: false };
  if (hours > 0) return { label: `${hours}h ${remMins}m left`, ended: false };
  return { label: `${remMins}m left`, ended: false };
}

export interface ChallengeCardProps {
  challenge: Challenge;
  /** Brief highlight pulse triggered by live ticker activity. */
  active?: boolean;
}

export function ChallengeCard({ challenge, active = false }: ChallengeCardProps) {
  const { label: countdown, ended } = useCountdown(challenge.deadline);

  const yesPct = Math.round((challenge.impliedYes ?? 0) * 100);
  const noPct = 100 - yesPct;
  const totalLamports = (challenge.yesPoolLamports ?? 0) + (challenge.noPoolLamports ?? 0);
  const resolved = challenge.status === 'resolved';

  return (
    <Link href={`/challenge/${challenge.id}`} className="block">
      <Card
        interactive
        className={`flex h-full flex-col gap-4 p-5 ${
          active ? 'border-accent/70 glow-brand' : ''
        }`}
      >
        {/* Header: status + metric type + activity ping */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {resolved ? (
              <Badge tone={challenge.outcome === 'yes' ? 'yes' : challenge.outcome === 'no' ? 'no' : 'neutral'}>
                {challenge.outcome ? `Resolved · ${challenge.outcome.toUpperCase()}` : 'Resolved'}
              </Badge>
            ) : (
              <Badge tone="brand" pulse>
                Live
              </Badge>
            )}
            <Badge tone="neutral">{challenge.metricType}</Badge>
          </div>
          {active && <Badge tone="accent" pulse>new</Badge>}
        </div>

        {/* Title + goal */}
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight">
            {challenge.title}
          </h3>
          <p className="line-clamp-2 text-sm text-muted">{challenge.goalText}</p>
        </div>

        {/* Implied-odds bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-yes">YES {yesPct}%</span>
            <span className="text-no">{noPct}% NO</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-yes" style={{ width: `${yesPct}%` }} />
            <div className="h-full bg-no" style={{ width: `${noPct}%` }} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pool" value={`${formatSol(totalLamports)} SOL`} tone="brand" />
          <Stat
            label="Hype"
            value={
              <span className="inline-flex items-center gap-1">
                <Flame className="h-4 w-4 text-accent" />
                {Math.round(challenge.hypeScore ?? 0)}
              </span>
            }
            tone="accent"
          />
          <Stat
            label="Streak"
            value={
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-4 w-4 text-yes" />
                {challenge.streak ?? 0}
              </span>
            }
          />
        </div>

        {/* Footer: creator + countdown */}
        <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="font-mono">{shortWallet(challenge.creatorWallet)}</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 ${ended ? 'text-warn' : ''}`}>
            <Clock className="h-3.5 w-3.5" />
            {countdown}
          </span>
        </div>
      </Card>
    </Link>
  );
}
