'use client';

import Link from 'next/link';
import type { Challenge } from '@/types/contract';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';
import { OddsBar } from '@/components/ui/OddsBar';
import { formatSol, shortWallet, timeUntil } from '@/lib/format';

export function ChallengeCard({ challenge: c }: { challenge: Challenge }) {
  const total = c.yesPoolLamports + c.noPoolLamports;
  const { text: deadline, ended } = timeUntil(c.deadline);
  const resolved = c.status === 'resolved';

  return (
    <Link href={`/challenge/${c.id}`} className="block">
      <Panel interactive className="p-4 h-full flex flex-col">
        {/* Top meta row — three states: live "Open", grey "Closed" (deadline
            passed, awaiting settlement), and a coloured "Settled" tag. */}
        <div className="flex items-center justify-between">
          {resolved ? (
            <Tag tone={c.outcome === 'yes' ? 'yes' : 'no'} solid>
              Settled {c.outcome ?? ''}
            </Tag>
          ) : c.status === 'refunded' ? (
            <Tag tone="muted" solid>Refunded</Tag>
          ) : c.status === 'pending_accept' ? (
            <Tag tone="accent">Pending</Tag>
          ) : c.status === 'under_review' ? (
            <Tag tone="ink" solid>Review</Tag>
          ) : c.status === 'disputed' ? (
            <Tag tone="accent" solid>Disputed</Tag>
          ) : ended ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 bg-muted inline-block" />
              <span className="label text-muted">Closed</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="live-tick" />
              <span className="label text-ink">Open</span>
            </span>
          )}
          <span className="label tracking-normal text-muted">
            {resolved
              ? 'Closed'
              : c.status === 'refunded'
                ? 'Refunded'
                : c.status === 'pending_accept'
                  ? 'Awaiting accept'
                  : c.status === 'under_review'
                    ? 'In review'
                    : c.status === 'disputed'
                      ? 'Disputed'
                      : ended
                        ? 'Awaiting result'
                        : `Closes in ${deadline}`}
          </span>
        </div>

        {/* Headline */}
        <h3 className="display text-2xl text-ink mt-3">{c.title}</h3>
        <p className="text-sm text-ink-2 mt-1.5 line-clamp-2">{c.goalText}</p>
        <p className="label mt-2">By {shortWallet(c.creatorWallet)}</p>

        {/* Odds */}
        <div className="mt-auto pt-4">
          <OddsBar impliedYes={c.impliedYes} />
        </div>

        {/* Footer stats */}
        <div className="grid grid-cols-3 mt-4 border-t border-line divide-x divide-line">
          <div className="pt-2 pr-2">
            <div className="label">Pool</div>
            <div className="num text-base mt-0.5">{formatSol(total)} <span className="text-faint text-xs">SOL</span></div>
          </div>
          <div className="pt-2 px-2">
            <div className="label">Hype</div>
            <div className="num text-base mt-0.5">{Math.round(c.hypeScore)}</div>
          </div>
          <div className="pt-2 pl-2">
            <div className="label">Streak</div>
            <div className="num text-base mt-0.5">{c.streak}d</div>
          </div>
        </div>
      </Panel>
    </Link>
  );
}
