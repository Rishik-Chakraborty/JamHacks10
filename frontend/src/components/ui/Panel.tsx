import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Hover-emphasis for clickable cards. */
  interactive?: boolean;
}

/** A flat card/panel: card surface, hairline border, no radius, no shadow. */
export function Panel({ interactive = false, className = '', ...rest }: Props) {
  return (
    <div
      className={
        `bg-card border border-line ${interactive ? 'transition-colors duration-150 hover:border-ink' : ''} ` +
        className
      }
      {...rest}
    />
  );
}
