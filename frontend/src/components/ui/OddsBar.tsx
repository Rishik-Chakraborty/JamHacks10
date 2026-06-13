import { formatPct } from '@/lib/format';

interface Props {
  /** Implied probability of YES in [0,1]. */
  impliedYes: number;
  /** Show the YES/NO labels + percentages above the bar. */
  labeled?: boolean;
  height?: number;
}

/** Flat YES/NO split bar. Deep green vs. brick red, hairline divider, no gradient. */
export function OddsBar({ impliedYes, labeled = true, height = 8 }: Props) {
  const yes = Math.min(1, Math.max(0, impliedYes));
  const yesPct = Math.round(yes * 100);
  return (
    <div>
      {labeled && (
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="num text-sm text-yes">
            YES <span className="font-semibold">{formatPct(yes)}</span>
          </span>
          <span className="num text-sm text-no">
            <span className="font-semibold">{formatPct(1 - yes)}</span> NO
          </span>
        </div>
      )}
      <div className="flex w-full border border-ink" style={{ height }}>
        <div className="bg-yes" style={{ width: `${yesPct}%` }} aria-label={`yes ${yesPct}%`} />
        <div className="bg-no flex-1" aria-label={`no ${100 - yesPct}%`} />
      </div>
    </div>
  );
}
