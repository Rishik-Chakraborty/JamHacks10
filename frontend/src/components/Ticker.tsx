/**
 * GymCast Live Ticker.
 *
 * A slim, app-wide bottom strip that subscribes to the global socket `ticker`
 * stream and renders a horizontal auto-scrolling marquee of recent activity:
 * whale bets, new progress photos, market resolutions, and AI commentary.
 *
 * - Keeps a rolling buffer (newest first, capped at MAX_EVENTS).
 * - Formats lamports -> SOL for display.
 * - Pulses a "LIVE" badge.
 * - Unsubscribes on unmount; degrades quietly when the socket has no events
 *   (the socket lib autoconnects and never throws on render).
 */
'use client';

import { useEffect, useState } from 'react';
import { onTicker } from '@/lib/socket';
import { Badge } from '@/components/ui/Badge';
import { LAMPORTS_PER_SOL, type TickerEvent } from '@/types/contract';

const MAX_EVENTS = 30;

/** Stable-ish key per event (socket events carry no id). */
function eventKey(e: TickerEvent, idx: number): string {
  return `${e.at}-${e.kind}-${e.challengeId}-${idx}`;
}

function shortWallet(wallet?: string): string {
  if (!wallet) return 'someone';
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}..${wallet.slice(-3)}`;
}

function formatSol(lamports?: number): string {
  if (lamports == null || !Number.isFinite(lamports)) return '0';
  const sol = lamports / LAMPORTS_PER_SOL;
  // Trim trailing zeros, keep up to 3 decimals.
  return parseFloat(sol.toFixed(3)).toString();
}

interface RenderedItem {
  icon: string;
  text: string;
  tone: 'brand' | 'accent' | 'yes' | 'no' | 'neutral';
}

function renderEvent(e: TickerEvent): RenderedItem {
  switch (e.kind) {
    case 'bet': {
      const side = e.side ? e.side.toUpperCase() : '???';
      const tone = e.side === 'yes' ? 'yes' : e.side === 'no' ? 'no' : 'brand';
      // Whale flag for sizeable bets (>= 1 SOL).
      const whale =
        e.amountLamports != null && e.amountLamports >= LAMPORTS_PER_SOL
          ? '🐳 '
          : '';
      return {
        icon: '🐳',
        text: `${whale}${shortWallet(e.wallet)} bet ${formatSol(
          e.amountLamports,
        )} SOL on ${side}`,
        tone,
      };
    }
    case 'photo':
      return {
        icon: '📸',
        text: e.challengeTitle
          ? `new progress photo — ${e.challengeTitle}`
          : 'new progress photo',
        tone: 'accent',
      };
    case 'resolve': {
      // Resolution outcome is encoded in `side` (yes/no) when present.
      const outcome = e.side ? e.side.toUpperCase() : 'CLOSED';
      const tone = e.side === 'yes' ? 'yes' : e.side === 'no' ? 'no' : 'neutral';
      return {
        icon: '⚖️',
        text: e.challengeTitle
          ? `market resolved ${outcome} — ${e.challengeTitle}`
          : `market resolved ${outcome}`,
        tone,
      };
    }
    case 'commentary':
      return {
        icon: '🎙️',
        text: e.message ?? 'live commentary',
        tone: 'brand',
      };
    default:
      return {
        icon: '⚡',
        text: e.message ?? 'activity',
        tone: 'neutral',
      };
  }
}

function TickerPill({ event }: { event: TickerEvent }) {
  const { icon, text, tone } = renderEvent(event);
  const dot =
    tone === 'yes'
      ? 'text-yes'
      : tone === 'no'
        ? 'text-no'
        : tone === 'accent'
          ? 'text-accent'
          : tone === 'brand'
            ? 'text-brand'
            : 'text-muted';
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
      <span aria-hidden>{icon}</span>
      <span className={`font-medium ${dot}`}>{text}</span>
      <span className="text-muted/40" aria-hidden>
        •
      </span>
    </span>
  );
}

export function Ticker() {
  const [events, setEvents] = useState<TickerEvent[]>([]);

  useEffect(() => {
    const unsubscribe = onTicker((e) => {
      setEvents((prev) => [e, ...prev].slice(0, MAX_EVENTS));
    });
    return unsubscribe;
  }, []);

  const hasEvents = events.length > 0;

  // Duplicate the list so the marquee loops seamlessly when there's content.
  const marqueeItems = hasEvents ? [...events, ...events] : [];

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border glass">
      <style>{`
        @keyframes gymcast-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .gymcast-ticker-track {
          display: inline-flex;
          align-items: center;
          gap: 1.5rem;
          padding-left: 1.5rem;
          animation: gymcast-ticker-scroll 40s linear infinite;
          will-change: transform;
        }
        .gymcast-ticker-viewport:hover .gymcast-ticker-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .gymcast-ticker-track { animation: none; }
        }
      `}</style>

      <div className="mx-auto flex h-10 max-w-screen-2xl items-center gap-3 px-3">
        <Badge tone="brand" pulse className="shrink-0 glow-brand">
          LIVE
        </Badge>

        <div className="gymcast-ticker-viewport relative flex-1 overflow-hidden">
          {hasEvents ? (
            <div className="gymcast-ticker-track">
              {marqueeItems.map((e, i) => (
                <TickerPill key={eventKey(e, i)} event={e} />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">
              Waiting for the action… bets, photos and AI calls land here live.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Ticker;
