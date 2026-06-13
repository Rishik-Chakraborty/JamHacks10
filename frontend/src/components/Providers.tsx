'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from '@/lib/query';
import { SolanaWalletProvider } from '@/lib/wallet';

/** Global providers: TanStack Query + Solana wallet-adapter (both from lib/). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </QueryProvider>
  );
}
