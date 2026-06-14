'use client';

import { useEffect, useState } from 'react';

/**
 * Current wall-clock time in ms, refreshed on an interval.
 *
 * Use this instead of calling `Date.now()` during render: a bare `Date.now()`
 * in the render body is impure (flagged by the React purity lint rule) and a
 * one-shot read never updates as time passes — so deadline/lock states would go
 * stale until the next unrelated re-render. This reads the clock in a lazy state
 * initializer (allowed) and ticks it so time-derived UI stays live.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
