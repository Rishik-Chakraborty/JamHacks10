'use client';

import { useState } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { ChallengeDetail } from '@/types/contract';
import { Button } from '@/components/ui/Button';
import { claimWinnings, MarketClientError } from '@/lib/market';

const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Resolved-market claim. Renders nothing until the market is settled. */
export function ClaimButton({ challenge }: { challenge: ChallengeDetail }) {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [pending, setPending] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (challenge.status !== 'resolved') return null;

  const programReady = Boolean(process.env.NEXT_PUBLIC_PROGRAM_ID);
  const marketReady = Boolean(challenge.marketPda);

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
          {sig && (
            <p className="text-sm text-yes mt-2">
              Claimed.{' '}
              <a className="num underline hover:text-accent" href={EXPLORER(sig)} target="_blank" rel="noreferrer">
                View on Explorer
              </a>
            </p>
          )}
          {err && <p className="text-sm text-no mt-2">{err}</p>}
        </>
      )}
    </div>
  );
}
