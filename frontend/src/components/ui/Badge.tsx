/**
 * GymCast Badge primitive — small status pills (challenge status, market side,
 * live indicators, metric type).
 */
import type { HTMLAttributes } from 'react';

type Tone = 'neutral' | 'brand' | 'accent' | 'yes' | 'no' | 'warn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Show a pulsing dot before the label (e.g. "live"). */
  pulse?: boolean;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  brand: 'bg-brand/15 text-brand border-brand/40',
  accent: 'bg-accent/15 text-accent border-accent/40',
  yes: 'bg-yes/15 text-yes border-yes/40',
  no: 'bg-no/15 text-no border-no/40',
  warn: 'bg-warn/15 text-warn border-warn/40',
};

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted',
  brand: 'bg-brand',
  accent: 'bg-accent',
  yes: 'bg-yes',
  no: 'bg-no',
  warn: 'bg-warn',
};

export function Badge({
  tone = 'neutral',
  pulse = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
      {...props}
    >
      {pulse && (
        <span className={`h-1.5 w-1.5 rounded-full pulse-dot ${DOT[tone]}`} />
      )}
      {children}
    </span>
  );
}
