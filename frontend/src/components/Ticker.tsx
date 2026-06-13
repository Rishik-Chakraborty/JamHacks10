'use client';

import { useEffect, useState } from 'react';
import { onTicker } from '@/lib/socket';
import type { TickerEvent } from '@/types/contract';
import { formatSol, shortWallet } from '@/lib/format';

function line(e: TickerEvent): { tag: string; tone: string; text: string } {
  switch (e.kind) {
    case 'bet':
      return {
        tag: 'BET',
        tone: e.side === 'yes' ? 'text-yes' : 'text-no',
        text: `${shortWallet(e.wallet ?? '')} backs ${(e.side ?? '').toUpperCase()} · ${formatSol(e.amountLamports ?? 0)} SOL`,
      };
    case 'photo':
      return { tag: 'PHOTO', tone: 'text-ink', text: e.message ?? `new progress${e.challengeTitle ? ` — ${e.challengeTitle}` : ''}` };
    case 'resolve':
      return {
        tag: 'RESOLVED',
        tone: 'text-accent',
        text: `${e.challengeTitle ?? 'market'} → ${(e.side ?? 'closed').toUpperCase()}`,
      };
    case 'commentary':
      return { tag: 'WIRE', tone: 'text-ink-2', text: e.message ?? '' };
    default:
      return { tag: 'NOTE', tone: 'text-ink', text: e.message ?? '' };
  }
}

export function Ticker() {
  const [events, setEvents] = useState<TickerEvent[]>([]);

  useEffect(() => onTicker((e) => setEvents((prev) => [e, ...prev].slice(0, 30))), []);

  const items = events.length ? events : null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-ink text-paper border-t-2 border-ink h-9 flex items-stretch overflow-hidden">
      <div className="flex items-center gap-2 px-3 border-r border-paper/30 shrink-0">
        <span className="live-tick" />
        <span className="display uppercase text-sm tracking-widest">Live Wire</span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {items ? (
          <div className="gc-marquee absolute inset-y-0 flex items-center whitespace-nowrap will-change-transform">
            {[...items, ...items].map((e, i) => {
              const l = line(e);
              return (
                <span key={i} className="inline-flex items-center text-sm">
                  <span className={`font-display uppercase tracking-wider mr-2 ${l.tone}`}>{l.tag}</span>
                  <span className="num text-paper/90">{l.text}</span>
                  <span className="text-paper/30 mx-4 select-none">/ /</span>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex items-center px-4 text-sm text-paper/50 num">
            awaiting market activity…
          </div>
        )}
      </div>

      <style>{`
        .gc-marquee { animation: gc-scroll 38s linear infinite; }
        .gc-marquee:hover { animation-play-state: paused; }
        @keyframes gc-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .gc-marquee { animation: none; } }
      `}</style>
    </div>
  );
}
