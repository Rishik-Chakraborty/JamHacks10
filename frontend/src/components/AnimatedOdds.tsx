'use client';

import { useAnimatedOdds } from '@/hooks/useAnimatedOdds';

interface Props {
  baseYes?: number;
  value?: number; // Pre-calculated animated value (0 to 1)
  drift?: number;
  height?: number;
  labeled?: boolean;
}

export function AnimatedOdds({
  baseYes = 0.5,
  value,
  drift = 0.003,
  height = 10,
  labeled = true,
}: Props) {
  const hookValue = useAnimatedOdds(baseYes, drift);
  const yes = value !== undefined ? value : hookValue;
  const yesPct = yes * 100;
  const noPct = 100 - yesPct;

  return (
    <div>
      {labeled && (
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="num text-sm text-yes">
            YES{' '}
            <span className="font-semibold tabular-nums">
              {yesPct.toFixed(4)}%
            </span>
          </span>
          <span className="num text-sm text-no">
            <span className="font-semibold tabular-nums">
              {noPct.toFixed(4)}%
            </span>{' '}
            NO
          </span>
        </div>
      )}
      <div className="flex w-full border border-ink overflow-hidden" style={{ height }}>
        <div
          className="bg-yes transition-[width] duration-300 ease-linear"
          style={{ width: `${yesPct}%` }}
        />
        <div className="bg-no flex-1" />
      </div>
    </div>
  );
}
