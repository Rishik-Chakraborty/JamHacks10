/**
 * Solana wallet-adapter provider on devnet.
 * Wrap the app in layout.tsx. Use `useWallet()` / `useConnection()` in components,
 * and `<WalletMultiButton />` (from @solana/wallet-adapter-react-ui) to connect.
 *
 * No adapters are hardcoded: an empty `wallets` array lets the adapter auto-detect
 * any Wallet-Standard wallet the browser has installed (Phantom, Solflare, Backpack,
 * …). `onError` swallows the benign `WalletNotReadyError` the `autoConnect` race can
 * throw before an extension finishes injecting, so it never surfaces to the user.
 */
'use client';

import { useCallback, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import type { WalletError } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const onError = useCallback((error: WalletError) => {
    // WalletNotReadyError fires when autoConnect races extension injection — benign.
    if (error.name === 'WalletNotReadyError') return;
    console.warn(`[wallet] ${error.name}: ${error.message}`);
  }, []);

  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={[]} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
