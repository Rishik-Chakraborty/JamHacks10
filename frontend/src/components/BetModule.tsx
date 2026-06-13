'use client';

import { useState } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { ChallengeDetail, Odds, BetSide } from '@/types/contract';
import { LAMPORTS_PER_SOL } from '@/types/contract';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { placeBet, MarketClientError } from '@/lib/market';
import { api } from '@/lib/api';

interface Props {
  challenge: ChallengeDetail;
  odds: Odds;
}

const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** YES/NO stake entry. Sends on-chain, then mirrors to the API (mirror errors are swallowed). */
export function BetModule({ challenge, odds }: Props) {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [side, setSide] = useState<BetSide>('yes');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const programReady = Boolean(process.env.NEXT_PUBLIC_PROGRAM_ID);
  const marketReady = Boolean(challenge.marketPda);
  const resolved = challenge.status === 'resolved';
  const locked = challenge.betLockAt ? Date.now() >= new Date(challenge.betLockAt).getTime() : false;
  const isInfluencer = publicKey?.toBase58() === challenge.creatorWallet;

  // A line is only bettable while active. Other states explain why not.
  const statusMsg =
    challenge.status === 'pending_accept'
      ? 'Waiting for the influencer to accept this line.'
      : challenge.status === 'refunded'
        ? 'This line was refunded — betting is closed.'
        : challenge.status === 'under_review'
          ? 'Final proof is in — under review. Betting is closed.'
          : challenge.status === 'disputed'
            ? 'The verdict is disputed — betting is closed.'
            : resolved
              ? 'This market is settled — betting is closed.'
              : null;

  const sol = Number(amount);
  const validAmount = Number.isFinite(sol) && sol > 0;
  const mult = side === 'yes' ? odds.yesMultiplier : odds.noMultiplier;

  async function onPlace() {
    if (!validAmount || !publicKey) return;
    setErr(null);
    setSig(null);
    setPending(true);
    const amountLamports = Math.round(sol * LAMPORTS_PER_SOL);
    try {
      const { txSig, positionPda } = await placeBet({
        connection,
        wallet: anchorWallet,
        marketPda: challenge.marketPda!,
        side,
        amountLamports,
      });
      setSig(txSig);
      // Mirror to backend — already on-chain, so swallow any mirror failure.
      try {
        await api.createBet({
          challengeId: challenge.id,
          bettorWallet: publicKey.toBase58(),
          side,
          amountLamports,
          txSig,
          positionPda,
        });
      } catch {
        /* mirror is best-effort */
      }
      setAmount('');
    } catch (e) {
      setErr(e instanceof MarketClientError || e instanceof Error ? e.message : 'Bet failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel className="p-4 mt-4">
      <h3 className="label text-ink">Place a bet</h3>
      <div className="rule-ink mt-1.5" />

      {statusMsg ? (
        <p className="text-sm text-muted mt-3">{statusMsg}</p>
      ) : !programReady || !marketReady ? (
        <p className="text-sm text-muted mt-3">
          Market not live yet — betting opens once the on-chain market is deployed.
        </p>
      ) : locked ? (
        <p className="text-sm text-muted mt-3">Betting is locked — within 12h of the deadline.</p>
      ) : isInfluencer ? (
        <p className="text-sm text-muted mt-3">
          You&rsquo;re the influencer on this line — you can&rsquo;t bet on yourself.
        </p>
      ) : !connected ? (
        <div className="mt-3">
          <p className="text-sm text-muted mb-2">Connect a wallet to back a side.</p>
          <WalletMultiButton />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {/* Side toggle — explicit per-state classes so the selected fill and
              text colour never conflict (a stacked text-yes + text-paper used to
              render green-on-green and hide the label). */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={side === 'yes'}
              onClick={() => setSide('yes')}
              className={`inline-flex items-center justify-center h-10 px-4 font-display uppercase tracking-wide font-semibold border transition-colors duration-150 ${
                side === 'yes'
                  ? 'bg-yes text-paper border-yes'
                  : 'bg-transparent text-yes border-yes hover:bg-yes-soft'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              aria-pressed={side === 'no'}
              onClick={() => setSide('no')}
              className={`inline-flex items-center justify-center h-10 px-4 font-display uppercase tracking-wide font-semibold border transition-colors duration-150 ${
                side === 'no'
                  ? 'bg-no text-paper border-no'
                  : 'bg-transparent text-no border-no hover:bg-no-soft'
              }`}
            >
              No
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="label" htmlFor="bet-amount">
              Stake (SOL)
            </label>
            <div className="flex items-center border border-ink mt-1.5 bg-card">
              <input
                id="bet-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="num flex-1 bg-transparent px-3 h-10 text-ink outline-none placeholder:text-faint"
              />
              <span className="num text-sm text-muted px-3 border-l border-line">SOL</span>
            </div>
            <p className="text-xs text-faint mt-1.5">
              Payout multiplier:{' '}
              <span className="num text-muted">{mult != null ? `${mult.toFixed(2)}×` : '—'}</span>
            </p>
          </div>

          <Button
            variant="accent"
            size="lg"
            className="w-full"
            onClick={onPlace}
            disabled={pending || !validAmount}
          >
            {pending ? 'Placing…' : `Back ${side.toUpperCase()}`}
          </Button>

          {sig && (
            <p className="text-sm text-yes">
              Bet placed.{' '}
              <a className="num underline hover:text-accent" href={EXPLORER(sig)} target="_blank" rel="noreferrer">
                View on Explorer
              </a>
            </p>
          )}
          {err && <p className="text-sm text-no">{err}</p>}
        </div>
      )}
    </Panel>
  );
}
