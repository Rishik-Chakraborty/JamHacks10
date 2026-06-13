import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'ink' | 'yes' | 'no' | 'accent';
  className?: string;
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  ink: 'text-ink',
  yes: 'text-yes',
  no: 'text-no',
  accent: 'text-accent',
};

/** A labeled numeric stat — uppercase micro-label over a monospace value. */
export function Stat({ label, value, hint, tone = 'ink', className = '' }: Props) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className={`num text-lg leading-tight mt-1 ${toneClass[tone]}`}>{value}</div>
      {hint ? <div className="text-xs text-faint mt-0.5">{hint}</div> : null}
    </div>
  );
}
