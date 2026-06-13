'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import type { FeedPost } from '@/types/contract';
import { api } from '@/lib/api';
import { PostCard } from '@/components/PostCard';

export function FeedStream() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const { data, isLoading, isError, error, refetch } = useQuery<FeedPost[]>({
    queryKey: ['feed', wallet ?? null],
    queryFn: () => api.getFeed(wallet),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border border-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 bg-paper-2 animate-pulse" />
              <div className="flex-1">
                <div className="h-3 w-32 bg-paper-2 animate-pulse" />
                <div className="h-2.5 w-20 bg-paper-2 animate-pulse mt-2" />
              </div>
            </div>
            <div className="aspect-square bg-paper-2 border-y border-ink animate-pulse" />
            <div className="h-14 bg-card" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-xl mx-auto border border-no bg-no-soft p-6">
        <p className="display text-xl text-no">Couldn&rsquo;t load the feed</p>
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
      <div className="max-w-xl mx-auto border border-line bg-card p-10 text-center">
        <p className="display text-2xl text-ink">No posts yet</p>
        <p className="text-sm text-muted mt-2">
          No proof has hit the feed yet —{' '}
          <Link href="/" className="underline hover:text-accent">
            check the Board
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {data.map((p) => (
        <PostCard key={p.photo.id} post={p} />
      ))}
    </div>
  );
}
