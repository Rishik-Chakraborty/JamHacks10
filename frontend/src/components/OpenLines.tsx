'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Challenge } from '@/types/contract';
import { api } from '@/lib/api';
import { ChallengeCard } from '@/components/ChallengeCard';

/** Suggestion-ranked open lines (the discovery page). */
export function OpenLines() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const { data, isLoading, isError, error, refetch } = useQuery<Challenge[]>({
    queryKey: ['rankedLines', wallet ?? null],
    queryFn: () => api.getRankedLines(wallet),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card border border-line h-64 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-no bg-no-soft p-6 max-w-2xl">
        <p className="display text-xl text-no">Couldn&rsquo;t load open lines</p>
        <p className="text-sm text-ink-2 mt-1">{error instanceof Error ? error.message : 'Request failed.'}</p>
        <button onClick={() => refetch()} className="label mt-3 underline hover:text-no">Retry</button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="border border-line bg-card p-10 text-center max-w-2xl mx-auto">
        <p className="display text-2xl text-ink">No open lines right now</p>
        <p className="text-sm text-muted mt-2">
          Be the first —{' '}
          <Link href="/create" className="underline hover:text-accent">challenge an influencer</Link>.
        </p>
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
