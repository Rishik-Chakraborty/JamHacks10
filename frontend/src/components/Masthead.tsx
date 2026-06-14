'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus, Search } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { UserSearch } from '@/components/UserSearch';

// Wallet button is browser-only — load client-side to avoid hydration mismatch.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

const linkClass =
  'display uppercase text-base text-ink hover:text-accent transition-colors leading-none';

export function Masthead() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="bg-paper sticky top-0 z-30">
      <div className="w-full px-5 sm:px-7 h-16 flex items-center gap-6">
        {/* Brand */}
        <Link href="/" className="shrink-0">
          <span className="display text-2xl sm:text-3xl md:text-4xl text-ink leading-none">
            the gains<span className="text-accent">Xchange</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-7 ml-2">
          <Link href="/feed" className={linkClass}>Feed</Link>
          <Link href="/portfolio" className={linkClass}>My Bets</Link>
          {wallet && <Link href={`/u/${wallet}`} className={linkClass}>Profile</Link>}
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
          {/* Desktop-only actions (nav lives in the bottom tab bar on mobile) */}
          <div className="hidden md:flex items-center gap-2.5">
            <UserSearch />
            <Link
              href="/create"
              className="inline-flex shrink-0 items-center h-9 px-4 bg-accent text-paper border border-accent font-display uppercase tracking-wide text-sm hover:bg-accent-deep transition-colors"
            >
              Challenge
            </Link>
            <Link
              href="/post/new"
              title="New post"
              aria-label="New post"
              className="inline-flex shrink-0 items-center justify-center h-9 w-9 bg-ink text-paper border border-ink hover:bg-accent hover:border-accent transition-colors"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </Link>
          </div>

          {/* Mobile search toggle */}
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search athletes"
            className={`md:hidden inline-flex shrink-0 items-center justify-center h-9 w-9 border transition-colors ${searchOpen ? 'bg-ink text-paper border-ink' : 'border-line text-ink'}`}
          >
            <Search className="h-5 w-5" strokeWidth={2} />
          </button>

          <WalletMultiButton />
        </div>
      </div>

      {/* Mobile search row (toggled) */}
      {searchOpen && (
        <div className="md:hidden px-5 pb-3">
          <UserSearch />
        </div>
      )}

      <div className="rule-ink" />
    </header>
  );
}
