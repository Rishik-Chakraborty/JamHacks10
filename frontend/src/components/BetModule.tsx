'use client';

/**
 * BetModule — YES/NO betting panel for a challenge's parimutuel market.
 *
 * Flow: pick a side -> enter SOL amount -> sign `placeBet` on-chain -> mirror
 * the confirmed bet into MongoDB via `api.createBet` (idempotent on txSig).
 * Live implied % + payout multiplier come from the parimutuel `Odds`.
 *
 * Degrades gracefully: no program id or no `marketPda` -> a "market not live"
 * card; no wallet -> a connect prompt; never throws on render.
 */
import { useMemo, useState } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import type { Challenge, ChallengeDetail, Odds, BetSide } from '@/types/contract';
import { LAMPORTS_PER_SOL } from '@/types/contract';
import { PROGRAM_ID_STR } from '@/lib/anchor';
import { placeBet, MarketClientError } from '@/lib/market';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Stat } from '@/components/ui/Stat';

interface BetModuleProps {
  challenge: ChallengeDetail | Challenge;
  odds: Odds;
}

type Status =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'success'; txSig: string }
  | { phase: 'error'; message: string };

const EXPLORER = (txSig: string) =>
  `https://explorer.solana.com/tx/${txSig}?cluster=devnet`;

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function mult(m: number | null): string {
  return m == null ? '—' : `${m.toFixed(2)}x`;
}

export function BetModule({ challenge, odds }: BetModuleProps) {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const wallet = useAnchorWallet();

  const [side, setSide] = useState<BetSide>('yes');
  const [amount, setAmount] = useState('0.1');
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  const marketLive = Boolean(PROGRAM_ID_STR) && Boolean(challenge.marketPda);
  const resolved = challenge.status === 'resolved';

  const amountLamports = useMemo(() => {
    const sol = Number.parseFloat(amount);
    if (!Number.isFinite(sol) || sol <= 0) return 0;
    return Math.round(sol * LAMPORTS_PER_SOL);
  }, [amount]);

  // --- Market not deployed / not attached yet ---------------------------------
  if (!marketLive) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Place a bet</h3>
          <Badge tone="warn">Market not live</Badge>
        </div>
        <p className="text-sm text-muted">
          {PROGRAM_ID_STR
            ? 'This challenge has no on-chain market yet. The creator needs to initialize it before betting opens.'
            : 'On-chain betting is offline — deploy the Anchor program and set NEXT_PUBLIC_PROGRAM_ID first.'}
        </p>
      </Card>
    );
  }

  async function onBet() {
    if (amountLamports <= 0) {
      setStatus({ phase: 'error', message: 'Enter an amount greater than 0 SOL.' });
      return;
    }
    setStatus({ phase: 'pending' });
    try {
      const { txSig, positionPda } = await placeBet({
        connection,
        wallet,
        marketPda: challenge.marketPda!,
        side,
        amountLamports,
      });

      // Mirror the confirmed on-chain bet into MongoDB (idempotent on txSig).
      try {
        await api.createBet({
          challengeId: challenge.id,
          bettorWallet: wallet!.publicKey.toBase58(),
          side,
          amountLamports,
          txSig,
          positionPda,
        });
      } catch {
        // The bet is already on-chain; a mirror failure shouldn't surface as a
        // bet failure. Backend reconciliation / change streams can recover it.
      }

      setStatus({ phase: 'success', txSig });
    } catch (err) {
      const message =
        err instanceof MarketClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Transaction failed.';
      setStatus({ phase: 'error', message });
    }
  }

  const yesTone = side === 'yes';
  const noTone = side === 'no';
  const busy = status.phase === 'pending';

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Place a bet</h3>
        <Badge tone="brand" pulse>
          Live odds
        </Badge>
      </div>

      {/* Live parimutuel odds */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="YES"
          tone="yes"
          value={pct(odds.impliedYes)}
          hint={`Payout ${mult(odds.yesMultiplier)}`}
        />
        <Stat
          label="NO"
          tone="no"
          value={pct(odds.impliedNo)}
          hint={`Payout ${mult(odds.noMultiplier)}`}
        />
      </div>

      {/* Side selection */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="yes"
          onClick={() => setSide('yes')}
          aria-pressed={yesTone}
          className={yesTone ? 'ring-2 ring-yes' : 'opacity-70'}
        >
          Bet YES
        </Button>
        <Button
          variant="no"
          onClick={() => setSide('no')}
          aria-pressed={noTone}
          className={noTone ? 'ring-2 ring-no' : 'opacity-70'}
        >
          Bet NO
        </Button>
      </div>

      {/* Amount */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Amount (SOL)
        </span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy || resolved}
          className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        />
      </label>

      {/* Action / connect prompt */}
      {resolved ? (
        <p className="text-sm text-muted">
          This market is resolved — betting is closed.
        </p>
      ) : !connected || !wallet ? (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          Connect your wallet to place a bet.
        </p>
      ) : (
        <Button
          variant={side === 'yes' ? 'yes' : 'no'}
          size="lg"
          onClick={onBet}
          disabled={busy || amountLamports <= 0}
        >
          {busy
            ? 'Confirming…'
            : `Bet ${amount || '0'} SOL on ${side.toUpperCase()}`}
        </Button>
      )}

      {/* Status feedback */}
      {status.phase === 'success' && (
        <div className="flex flex-col gap-1 rounded-xl border border-yes/40 bg-yes/10 px-3 py-2 text-sm">
          <span className="font-medium text-yes">Bet placed!</span>
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

export default BetModule;
