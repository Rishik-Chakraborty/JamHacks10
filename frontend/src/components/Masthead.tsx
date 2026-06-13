'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Masthead() {
  const path = usePathname();

  const links = [
    { href: '/', label: 'Feed' },
    { href: '/lines', label: 'Lines' },
    { href: '/profile', label: 'Profile' },
    { href: '/admin', label: 'Admin' },
  ];

  return (
    <header className="bg-paper sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-end justify-between gap-4">
        <Link href="/" className="group">
          <div className="display text-4xl sm:text-5xl text-ink leading-none">
            Gym<span className="text-accent">Cast</span>
          </div>
          <div className="label mt-1">The Fitness Prediction Market</div>
        </Link>

        <nav className="flex items-center gap-5 pb-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`display uppercase text-base transition-colors ${
                path === l.href ? 'text-accent' : 'text-ink hover:text-accent'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="rule-ink" />
    </header>
  );
}
