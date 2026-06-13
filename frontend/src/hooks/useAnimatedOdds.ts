'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Hook that returns a smoothly fluctuating value around `base`,
 * simulating a live parimutuel market feed.
 */
export function useAnimatedOdds(base: number, drift = 0.003) {
  const [value, setValue] = useState(base);
  const targetRef = useRef(base);
  const currentRef = useRef(base);
  const frameRef = useRef<number>(0);

  // Pick a new random target every 800–1600ms
  useEffect(() => {
    const pickTarget = () => {
      const offset = (Math.random() - 0.5) * 2 * drift;
      targetRef.current = Math.min(0.9999, Math.max(0.0001, base + offset));
    };

    pickTarget();
    const interval = setInterval(pickTarget, 800 + Math.random() * 800);
    return () => clearInterval(interval);
  }, [base, drift]);

  // Smooth interpolation toward the target at ~60fps
  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      const curr = currentRef.current;
      const tgt = targetRef.current;
      const next = curr + (tgt - curr) * 0.08;
      currentRef.current = next;
      setValue(next);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return value;
}
