import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'solid' | 'accent' | 'outline' | 'yes' | 'no';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center font-display uppercase tracking-wide font-semibold ' +
  'border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none';

const variants: Record<Variant, string> = {
  solid: 'bg-ink text-paper border-ink hover:bg-accent hover:border-accent',
  accent: 'bg-accent text-paper border-accent hover:bg-accent-deep hover:border-accent-deep',
  outline: 'bg-transparent text-ink border-ink hover:bg-ink hover:text-paper',
  yes: 'bg-transparent text-yes border-yes hover:bg-yes hover:text-paper',
  no: 'bg-transparent text-no border-no hover:bg-no hover:text-paper',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-[0.95rem]',
  lg: 'h-12 px-6 text-lg',
};

/** Flat, hard-edged button. No radius, no shadow. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'solid', size = 'md', className = '', ...rest },
  ref,
) {
  return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
});
