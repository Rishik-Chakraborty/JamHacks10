'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Challenge } from '@/types/contract';
import { formatSol } from '@/lib/format';

export function StatsBand() {
  const { data } = useQuery<Challenge[]>({ queryKey: ['challenges'], queryFn: api.listChallenges });

  const challenges = data ?? [];
  const openCount = challenges.filter((c) => c.status === 'active').length;
  const totalStaked = challenges.reduce((s, c) => s + c.yesPoolLamports + c.noPoolLamports, 0);
  const athletes = new Set(challenges.map((c) => c.creatorWallet)).size;
  const settled = challenges.filter((c) => c.status === 'resolved').length;

  const cells = [
    { label: 'Open Lines', value: data ? String(openCount) : '—' },
    { label: 'SOL at Stake', value: data ? formatSol(totalStaked) : '—' },
    { label: 'Influencers', value: data ? String(athletes) : '—' },
    { label: 'Settled', value: data ? String(settled) : '—' },
  ];

  return (
    <div className="bg-ink text-paper">
      <div className="max-w-6xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 divide-x divide-paper/20">
        {cells.map((c, i) => (
          <div key={c.label} className={`py-5 ${i === 0 ? '' : 'pl-5'} ${i % 2 === 0 ? 'pr-5 md:pr-0' : ''}`}>
            <div className="num text-3xl sm:text-4xl leading-none">{c.value}</div>
            <div className="label text-paper/60 mt-2">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
