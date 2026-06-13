/**
 * Top navigation bar: GymCast brand, primary links, and the Solana wallet
 * connect button. Client component because WalletMultiButton needs wallet
 * context. Sticky + glass so it floats over the energetic background.
 */
'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Dumbbell, Plus } from 'lucide-react';

// WalletMultiButton touches browser-only wallet APIs; load client-side only to
// avoid SSR hydration mismatches.
const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false },
);

export function Nav() {
  return (
    <header className="sticky top-0 z-50 glass">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand glow-brand">
            <Dumbbell className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-gradient">
            GymCast
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/create"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Link>
          <WalletMultiButton />
        </div>
      </nav>
    </header>
  );
}
