/**
 * App-wide client providers. Composes TanStack Query (server-state cache) +
 * Solana wallet-adapter (devnet, Phantom). Rendered from the root layout so
 * every route can use `useQuery` and `useWallet`/`useConnection`.
 */
'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from '@/lib/query';
import { SolanaWalletProvider } from '@/lib/wallet';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </QueryProvider>
  );
}
