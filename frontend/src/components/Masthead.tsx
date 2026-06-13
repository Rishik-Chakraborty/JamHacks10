'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { UserSearch } from '@/components/UserSearch';

// Wallet button is browser-only — load client-side to avoid hydration mismatch.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

export function Masthead() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  return (
    <header className="bg-paper sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-end justify-between gap-4">
        <Link href="/" className="group">
          <div className="display text-4xl sm:text-5xl text-ink leading-none">
            Gym<span className="text-accent">Cast</span>
          </div>
          <div className="label mt-1">The Fitness Prediction Market</div>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-5 pb-1">
          <Link href="/" className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            Markets
          </Link>
          <Link href="/lines" className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            Lines
          </Link>
          <Link href="/feed" className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            Feed
          </Link>
          <Link href="/how-it-works" className="hidden md:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            How to Bet
          </Link>
          <Link href="/portfolio" className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            My Bets
          </Link>
          {wallet && (
            <Link
              href={`/u/${wallet}`}
              className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors"
            >
              Profile
            </Link>
          )}
          <Link
            href="/create"
            className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors"
          >
            Open a Line
          </Link>
          <UserSearch />
          <WalletMultiButton />
        </nav>
      </div>

      <div className="rule-ink" />
    </header>
  );
}
