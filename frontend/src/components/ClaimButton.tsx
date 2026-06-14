'use client';

import { useState } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import type { ChallengeDetail } from '@/types/contract';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { claimWinnings, MarketClientError } from '@/lib/market';

const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Resolved-market claim. Renders nothing until the market is settled. */
export function ClaimButton({ challenge }: { challenge: ChallengeDetail }) {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  const [pending, setPending] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);

  if (challenge.status !== 'resolved') return null;

  const programReady = Boolean(process.env.NEXT_PUBLIC_PROGRAM_ID);
  const marketReady = Boolean(challenge.marketPda);
  // Claimed is sticky: the server flag (survives refresh) OR a just-completed claim.
  const claimed = justClaimed || Boolean(challenge.viewerClaimed);

  async function onClaim() {
    setErr(null);
    setSig(null);
    setPending(true);
    try {
      const res = await claimWinnings({
        connection,
        wallet: anchorWallet,
        marketPda: challenge.marketPda!,
      });
      setSig(res.txSig);
      setJustClaimed(true);
      // Persist the claim so the button stays claimed permanently (across refresh).
      const wallet = publicKey?.toBase58();
      if (wallet) {
        await api.markClaimed(challenge.id, wallet).catch(() => {});
        await queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
      }
    } catch (e) {
      setErr(e instanceof MarketClientError || e instanceof Error ? e.message : 'Claim failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rule pt-4 mt-4">
      <div className="flex items-baseline justify-between">
        <h3 className="label text-ink">Settled</h3>
        <span className="label">
          Outcome{' '}
          <span className={challenge.outcome === 'yes' ? 'text-yes' : 'text-no'}>
            {challenge.outcome ? challenge.outcome.toUpperCase() : '—'}
          </span>
        </span>
      </div>

      {!programReady || !marketReady ? (
        <p className="text-sm text-muted mt-2">
          On-chain market unavailable — nothing to claim here.
        </p>
      ) : claimed ? (
        <div className="mt-3">
          <div className="flex h-11 w-full items-center justify-center border border-yes bg-yes-soft text-yes font-display uppercase tracking-wide text-sm">
            ✓ Winnings claimed
          </div>
          {sig && (
            <p className="text-sm text-ink-2 mt-2">
              <a className="num underline hover:text-accent" href={EXPLORER(sig)} target="_blank" rel="noreferrer">
                View on Explorer
              </a>
            </p>
          )}
        </div>
      ) : !connected ? (
        <div className="mt-3">
          <p className="text-sm text-muted mb-2">Connect a wallet to claim your winnings.</p>
          <WalletMultiButton />
        </div>
      ) : (
        <>
          <Button
            variant="accent"
            size="lg"
            className="w-full mt-3"
            onClick={onClaim}
            disabled={pending}
          >
            {pending ? 'Claiming…' : 'Claim winnings'}
          </Button>
          {err && <p className="text-sm text-no mt-2">{err}</p>}
        </>
      )}
    </div>
  );
}
