import type { HTMLAttributes } from 'react';

type Tone = 'ink' | 'accent' | 'yes' | 'no' | 'muted';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Filled vs. outlined. */
  solid?: boolean;
}

const outline: Record<Tone, string> = {
  ink: 'text-ink border-ink',
  accent: 'text-accent border-accent',
  yes: 'text-yes border-yes',
  no: 'text-no border-no',
  muted: 'text-muted border-line',
};
const filled: Record<Tone, string> = {
  ink: 'bg-ink text-paper border-ink',
  accent: 'bg-accent text-paper border-accent',
  yes: 'bg-yes text-paper border-yes',
  no: 'bg-no text-paper border-no',
  muted: 'bg-paper-2 text-muted border-line',
};

/** Small uppercase tag/label chip. Hard-edged. */
export function Tag({ tone = 'ink', solid = false, className = '', ...rest }: Props) {
  return (
    <span
      className={
        `inline-flex items-center gap-1 border px-1.5 py-0.5 font-display uppercase text-xs tracking-wider leading-none ` +
        `${solid ? filled[tone] : outline[tone]} ${className}`
      }
      {...rest}
    />
  );
}
