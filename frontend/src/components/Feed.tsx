'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Challenge } from '@/types/contract';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Button } from '@/components/ui/Button';

type Filter = 'all' | 'live' | 'settled';
type Sort = 'closing' | 'volume' | 'underdog' | 'newest';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'settled', label: 'Settled' },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: 'closing', label: 'Closing soon' },
  { key: 'volume', label: 'Volume' },
  { key: 'underdog', label: 'Underdog' },
  { key: 'newest', label: 'Newest' },
];

function applyFilter(list: Challenge[], filter: Filter): Challenge[] {
  if (filter === 'live') return list.filter((c) => c.status === 'active');
  if (filter === 'settled') return list.filter((c) => c.status === 'resolved');
  return list;
}

function applySort(list: Challenge[], sort: Sort): Challenge[] {
  const out = [...list];
  switch (sort) {
    case 'closing':
      // Active markets first, ordered by nearest deadline; settled sink to the bottom.
      return out.sort((a, b) => {
        const aActive = a.status === 'active' ? 0 : 1;
        const bActive = b.status === 'active' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    case 'volume':
      return out.sort(
        (a, b) =>
          b.yesPoolLamports + b.noPoolLamports - (a.yesPoolLamports + a.noPoolLamports),
      );
    case 'underdog':
      // Most lopsided / contrarian — largest distance from a 50/50 line.
      return out.sort(
        (a, b) => Math.abs(0.5 - b.impliedYes) - Math.abs(0.5 - a.impliedYes),
      );
    case 'newest':
      return out.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
}

export function Feed() {
  const { data, isLoading, isError, error, refetch } = useQuery<Challenge[]>({
    queryKey: ['challenges'],
    queryFn: api.listChallenges,
    refetchInterval: 30_000,
  });

  const [filter, setFilter] = useState<Filter>('live');
  const [sort, setSort] = useState<Sort>('closing');

  const visible = useMemo(() => {
    if (!data) return [];
    return applySort(applyFilter(data, filter), sort);
  }, [data, filter, sort]);

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
    <div>
      {/* Toolbar */}
      <div className="border border-line bg-card mb-4">
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <span className="label text-faint w-12 shrink-0">Filter</span>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={active ? 'solid' : 'outline'}
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="label text-faint w-12 shrink-0 md:w-auto">Sort</span>
            <div className="flex flex-wrap gap-1.5">
              {SORTS.map((s) => {
                const active = sort === s.key;
                return (
                  <Button
                    key={s.key}
                    size="sm"
                    variant={active ? 'accent' : 'outline'}
                    aria-pressed={active}
                    onClick={() => setSort(s.key)}
                  >
                    {s.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Count */}
        <div className="border-t border-line px-3 py-1.5">
          <span className="label text-muted">
            <span className="num text-ink">{visible.length}</span> market{visible.length === 1 ? '' : 's'} shown
          </span>
        </div>
      </div>

      {/* Grid / empty */}
      {visible.length === 0 ? (
        <div className="border border-line bg-card p-10 text-center">
          <p className="display text-2xl text-ink">No markets match</p>
          <p className="text-sm text-muted mt-2">Nothing on the board fits this filter right now.</p>
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilter('live');
                setSort('closing');
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      )}
    </div>
  );
}
