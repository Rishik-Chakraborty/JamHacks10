/**
 * GymCast Card primitive — standard surface used by feed items, panels, modals.
 * Set `glass` for a frosted variant, `interactive` for hover affordance.
 */
import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  interactive?: boolean;
}

export function Card({
  glass = false,
  interactive = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`${glass ? 'glass' : 'card'} ${
        interactive ? 'transition-colors hover:border-brand/60 cursor-pointer' : ''
      } ${className}`}
      {...props}
    />
  );
}
