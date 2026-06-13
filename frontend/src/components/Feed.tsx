'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Challenge } from '@/types/contract';
import { ChallengeCard } from '@/components/ChallengeCard';

export function Feed() {
  const { data, isLoading, isError, error, refetch } = useQuery<Challenge[]>({
    queryKey: ['challenges'],
    queryFn: api.listChallenges,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card h-56 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-no bg-no-soft p-6">
        <p className="display text-xl text-no">Couldn’t load the board</p>
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
      <div className="border border-line bg-card p-10 text-center">
        <p className="display text-2xl text-ink">No open lines yet</p>
        <p className="text-sm text-muted mt-2">Be the first to put a goal on the board.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((c) => (
        <ChallengeCard key={c.id} challenge={c} />
      ))}
    </div>
  );
}
