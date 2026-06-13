'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
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
            the gains<span className="text-accent">Xchange</span>
          </div>
          <div className="label mt-1">Bet on the grind</div>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-5 pb-1">
          <Link href="/feed" className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            Feed
          </Link>
          <Link href="/portfolio" className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
            My Bets
          </Link>
          {wallet && (
            <Link href={`/u/${wallet}`} className="hidden sm:inline display uppercase text-base text-ink hover:text-accent transition-colors">
              Profile
            </Link>
          )}
          <Link
            href="/post/new"
            title="New post"
            className="inline-flex items-center justify-center h-9 w-9 bg-ink text-paper border border-ink hover:bg-accent hover:border-accent transition-colors"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </Link>
          <UserSearch />
          <WalletMultiButton />
        </nav>
      </div>

      <div className="rule-ink" />
    </header>
  );
}
