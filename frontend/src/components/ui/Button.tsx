/**
 * GymCast Button primitive.
 * Variants: brand (primary), accent (energetic CTA), outline, ghost,
 * yes / no (market sides). Sizes: sm | md | lg.
 */
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'brand' | 'accent' | 'outline' | 'ghost' | 'yes' | 'no';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  brand:
    'bg-brand text-white hover:bg-brand-strong glow-brand disabled:opacity-50',
  accent:
    'bg-accent text-black font-semibold hover:brightness-110 disabled:opacity-50',
  outline:
    'border border-border bg-transparent text-foreground hover:bg-surface-2 disabled:opacity-50',
  ghost: 'bg-transparent text-muted hover:text-foreground hover:bg-surface-2',
  yes: 'bg-yes/15 text-yes border border-yes/40 hover:bg-yes/25 disabled:opacity-50',
  no: 'bg-no/15 text-no border border-no/40 hover:bg-no/25 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
};

export function Button({
  variant = 'brand',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
