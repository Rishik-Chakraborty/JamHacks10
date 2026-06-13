'use client';

/**
 * ClaimButton — lets a bettor claim winnings (or a refund) once a challenge's
 * market is resolved. Renders nothing unless `challenge.status === 'resolved'`.
 *
 * Degrades gracefully: disabled with a friendly note when the program isn't
 * deployed, the market isn't attached, or no wallet is connected. Never throws
 * on render.
 */
import { useState } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import type { Challenge, ChallengeDetail } from '@/types/contract';
import { PROGRAM_ID_STR } from '@/lib/anchor';
import { claimWinnings, MarketClientError } from '@/lib/market';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface ClaimButtonProps {
  challenge: ChallengeDetail | Challenge;
}

type Status =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'success'; txSig: string }
  | { phase: 'error'; message: string };

const EXPLORER = (txSig: string) =>
  `https://explorer.solana.com/tx/${txSig}?cluster=devnet`;

export function ClaimButton({ challenge }: ClaimButtonProps) {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const wallet = useAnchorWallet();
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  // Only meaningful for resolved markets.
  if (challenge.status !== 'resolved') return null;

  const marketLive = Boolean(PROGRAM_ID_STR) && Boolean(challenge.marketPda);
  const busy = status.phase === 'pending';

  async function onClaim() {
    setStatus({ phase: 'pending' });
    try {
      const { txSig } = await claimWinnings({
        connection,
        wallet,
        marketPda: challenge.marketPda!,
      });
      setStatus({ phase: 'success', txSig });
    } catch (err) {
      const message =
        err instanceof MarketClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Claim failed.';
      setStatus({ phase: 'error', message });
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Claim payout</h3>
        <Badge tone={challenge.outcome === 'yes' ? 'yes' : challenge.outcome === 'no' ? 'no' : 'neutral'}>
          {challenge.outcome ? `Resolved ${challenge.outcome.toUpperCase()}` : 'Resolved'}
        </Badge>
      </div>

      {!marketLive ? (
        <p className="text-sm text-muted">
          {PROGRAM_ID_STR
            ? 'No on-chain market is attached to this challenge — nothing to claim.'
            : 'On-chain claims are offline — deploy the Anchor program and set NEXT_PUBLIC_PROGRAM_ID first.'}
        </p>
      ) : !connected || !wallet ? (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          Connect your wallet to claim winnings.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Winners receive their stake plus a proportional share of the losing
            pool. One-sided markets refund your stake.
          </p>
          <Button variant="accent" size="lg" onClick={onClaim} disabled={busy}>
            {busy ? 'Claiming…' : 'Claim winnings'}
          </Button>
        </>
      )}

      {status.phase === 'success' && (
        <div className="flex flex-col gap-1 rounded-xl border border-yes/40 bg-yes/10 px-3 py-2 text-sm">
          <span className="font-medium text-yes">Claim submitted!</span>
          <span className="text-muted">
            Any payout has been transferred to your wallet.
          </span>
          <a
            href={EXPLORER(status.txSig)}
            target="_blank"
            rel="noreferrer"
            className="text-brand underline"
          >
            View on Solana Explorer
          </a>
        </div>
      )}
      {status.phase === 'error' && (
        <p className="rounded-xl border border-no/40 bg-no/10 px-3 py-2 text-sm text-no">
          {status.message}
        </p>
      )}
    </Card>
  );
}

export default ClaimButton;
