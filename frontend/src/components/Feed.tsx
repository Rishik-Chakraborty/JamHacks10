/**
 * Feed — the live grid of challenge markets on the landing page.
 *
 * Fetches challenges via TanStack Query (`api.listChallenges`) and renders a
 * responsive grid of <ChallengeCard/>. Subscribes lightly to the socket ticker
 * to surface a brief "new activity" pulse on the affected card — it does NOT
 * build a global ticker (that's another agent's job).
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { onTicker } from '@/lib/socket';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function Feed() {
  const {
    data: challenges,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['challenges'],
    queryFn: () => api.listChallenges(),
    refetchInterval: 30_000,
  });

  // Track which challenge most recently saw ticker activity so its card can
  // pulse briefly. Lightweight only — no global ticker UI here.
  const [activeId, setActiveId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = onTicker((e) => {
      if (!e.challengeId) return;
      setActiveId(e.challengeId);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActiveId(null), 4_000);
    });
    return () => {
      off();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-72 animate-pulse p-5">
            <div className="h-full w-full rounded-xl bg-surface-2/60" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-no">
          Couldn&apos;t load challenges
          {error instanceof Error ? `: ${error.message}` : '.'}
        </p>
        <p className="text-xs text-muted">
          Is the backend running on{' '}
          <span className="font-mono">
            {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'}
          </span>
          ?
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  if (!challenges || challenges.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-base font-semibold">No live challenges yet.</p>
        <p className="max-w-sm text-sm text-muted">
          Be the first to put a fitness goal on the line and let the crowd bet
          on whether you crush it.
        </p>
        <Link href="/create">
          <Button variant="accent" size="md">
            Start a Challenge
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isFetching && (
        <span className="self-end text-xs text-muted">Refreshing…</span>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} active={c.id === activeId} />
        ))}
      </div>
    </div>
  );
}
