interface Props {
  src: string;
  alt?: string;
  className?: string;
  /** Desaturate + boost contrast to fit the newsprint palette. */
  duotone?: boolean;
  children?: React.ReactNode;
}

/**
 * Background-image block. If the photo fails to load, the bg-paper-2 fill shows
 * instead of a broken-image icon — so external (Unsplash) images degrade cleanly.
 */
export function EditorialImage({ src, alt = '', className = '', duotone = true, children }: Props) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={`bg-paper-2 bg-cover bg-center relative ${className}`}
      style={{
        backgroundImage: `url("${src}")`,
        filter: duotone ? 'grayscale(1) contrast(1.08)' : undefined,
      }}
    >
      {children}
    </div>
  );
}
