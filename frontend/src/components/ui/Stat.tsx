/**
 * GymCast Stat primitive — labelled metric block (pools, odds, hype, streak).
 * `value` is rendered prominently; `label` above it. Optional `tone` colors
 * the value (e.g. yes/no for market sides).
 */
import type { ReactNode } from 'react';

type Tone = 'default' | 'brand' | 'accent' | 'yes' | 'no';

export interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
}

const TONES: Record<Tone, string> = {
  default: 'text-foreground',
  brand: 'text-brand',
  accent: 'text-accent',
  yes: 'text-yes',
  no: 'text-no',
};

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: StatProps) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${TONES[tone]}`}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
