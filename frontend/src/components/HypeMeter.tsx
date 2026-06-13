/**
 * HypeMeter — animated 0..100 momentum gauge driven by `hypeScore`, with
 * streak / misses badges. Reflects live `onHype` updates passed in as props by
 * the parent (ChallengeDetail) so the bar re-animates on each socket tick.
 */
'use client';

import { Flame, Skull } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface HypeMeterProps {
  hypeScore: number;
  streak: number;
  misses: number;
  className?: string;
}

function tone(score: number): { bar: string; label: string } {
  if (score >= 75) return { bar: 'bg-accent', label: 'On fire' };
  if (score >= 45) return { bar: 'bg-brand', label: 'Heating up' };
  if (score >= 20) return { bar: 'bg-warn', label: 'Lukewarm' };
  return { bar: 'bg-no', label: 'Cold' };
}

export function HypeMeter({ hypeScore, streak, misses, className = '' }: HypeMeterProps) {
  const pct = Math.max(0, Math.min(100, Math.round(hypeScore)));
  const t = tone(pct);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Hype Meter
          </span>
          <Badge tone="brand" pulse>
            {t.label}
          </Badge>
        </div>
        <span className="text-2xl font-bold tabular-nums text-foreground">{pct}</span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${t.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="yes" className="gap-1">
          <Flame className="h-3.5 w-3.5" />
          {streak} day streak
        </Badge>
        <Badge tone={misses > 0 ? 'no' : 'neutral'} className="gap-1">
          <Skull className="h-3.5 w-3.5" />
          {misses} {misses === 1 ? 'miss' : 'misses'}
        </Badge>
      </div>
    </div>
  );
}
