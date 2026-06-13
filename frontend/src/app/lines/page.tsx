'use client';

import { AnimatedOdds } from '@/components/AnimatedOdds';
import { useAnimatedOdds } from '@/hooks/useAnimatedOdds';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useState } from 'react';
import { Flame, Calendar, Users, Trophy, Wallet } from 'lucide-react';

/* ==========================================================================
   Hardcoded demo data
   ========================================================================== */

const LINES = [
  {
    id: 'line-1',
    title: 'Will his abs be visible by the end of the year?',
    creator: 'Ryan',
    status: 'active' as const,
    deadline: 'Dec 31, 2025',
    impliedYes: 0.6038,
    totalPoolBase: 245.8,
    bets: 14,
    hype: 94,
    streak: 12,
  },
];

function LineRowCard({
  line,
  connected,
  bettingOn,
  betAmount,
  setBetAmount,
  handleBetClick,
  handlePlaceBet,
  setBettingOn,
}: {
  line: typeof LINES[number];
  connected: boolean;
  bettingOn: { lineId: string; type: 'YES' | 'NO' } | null;
  betAmount: string;
  setBetAmount: (val: string) => void;
  handleBetClick: (lineId: string, type: 'YES' | 'NO') => void;
  handlePlaceBet: () => void;
  setBettingOn: (val: null) => void;
}) {
  const yesProb = useAnimatedOdds(line.impliedYes, 0.005);
  
  const yesPool = line.totalPoolBase * yesProb;
  const noPool = line.totalPoolBase * (1 - yesProb);
  const yesMultiplier = (1 / yesProb).toFixed(3) + '×';
  const noMultiplier = (1 / (1 - yesProb)).toFixed(3) + '×';
  const isCurrentBet = bettingOn?.lineId === line.id;

  return (
    <div className="bg-card border border-line hover:border-ink transition-colors p-5">
      {/* Status + title */}
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="live-tick" />
          <span className="label text-ink">Open</span>
        </span>
        <span className="flex items-center gap-1 label text-muted lowercase first-letter:uppercase">
          <Calendar className="w-3 h-3" /> Closes {line.deadline}
        </span>
      </div>
      <h2 className="display text-xl text-ink leading-tight">{line.title}</h2>
      <p className="text-xs text-muted mt-1">by {line.creator}</p>

      {/* Animated odds */}
      <div className="mt-4">
        <AnimatedOdds value={yesProb} height={10} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-px bg-line border border-line mt-4">
        <div className="bg-card p-2.5">
          <div className="label text-[10px]">Yes pool</div>
          <div className="num text-sm text-yes mt-0.5 tabular-nums">{yesPool.toFixed(2)} SOL</div>
        </div>
        <div className="bg-card p-2.5">
          <div className="label text-[10px]">No pool</div>
          <div className="num text-sm text-no mt-0.5 tabular-nums">{noPool.toFixed(2)} SOL</div>
        </div>
        <div className="bg-card p-2.5">
          <div className="label text-[10px]">Yes payout</div>
          <div className="num text-sm text-yes mt-0.5 tabular-nums">{yesMultiplier}</div>
        </div>
        <div className="bg-card p-2.5">
          <div className="label text-[10px]">No payout</div>
          <div className="num text-sm text-no mt-0.5 tabular-nums">{noMultiplier}</div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-5 mt-3 text-xs">
        <span className="flex items-center gap-1 num text-muted">
          <Users className="w-3.5 h-3.5" /> {line.bets} bets
        </span>
        <span className="flex items-center gap-1 num text-muted tabular-nums">
          <Wallet className="w-3.5 h-3.5" /> {line.totalPoolBase.toFixed(1)} SOL
        </span>
        <span className="flex items-center gap-1 num text-muted">
          <Flame className="w-3.5 h-3.5 text-accent fill-accent" /> {line.hype}
        </span>
        <span className="flex items-center gap-1 num text-muted">
          <Trophy className="w-3.5 h-3.5 text-yellow-600" /> {line.streak}d streak
        </span>
      </div>

      {/* Bet placement inputs if betting state active */}
      {isCurrentBet ? (
        <div className="mt-4 p-4 border-2 border-dashed border-accent bg-paper-2 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 text-sm font-semibold uppercase text-ink">
            Betting on <span className={bettingOn.type === 'YES' ? 'text-yes' : 'text-no'}>{bettingOn.type}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold text-muted">Amount:</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-20 bg-card border border-ink text-center h-8 font-mono text-sm"
            />
            <span className="text-xs font-mono font-bold text-ink">SOL</span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handlePlaceBet}
              className="flex-1 sm:flex-initial h-8 px-4 bg-accent text-paper font-display uppercase text-xs hover:opacity-90"
            >
              Confirm Bet
            </button>
            <button
              onClick={() => setBettingOn(null)}
              className="h-8 px-3 bg-transparent text-ink border border-ink font-display uppercase text-xs hover:bg-paper-3"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Bet buttons */
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={() => handleBetClick(line.id, 'YES')}
            className="h-10 bg-transparent text-yes border-2 border-yes font-display uppercase tracking-wide text-sm hover:bg-yes hover:text-paper transition-colors"
          >
            Back YES
          </button>
          <button
            onClick={() => handleBetClick(line.id, 'NO')}
            className="h-10 bg-transparent text-no border-2 border-no font-display uppercase tracking-wide text-sm hover:bg-no hover:text-paper transition-colors"
          >
            Back NO
          </button>
        </div>
      )}
    </div>
  );
}

export default function LinesPage() {
  const { select, connect, connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [bettingOn, setBettingOn] = useState<{ lineId: string; type: 'YES' | 'NO' } | null>(null);
  const [betAmount, setBetAmount] = useState<string>('0.5');
  const [betReceipt, setBetReceipt] = useState<{ amount: string; type: 'YES' | 'NO'; txSig: string } | null>(null);

  const handleBetClick = async (lineId: string, type: 'YES' | 'NO') => {
    if (!connected) {
      try {
        select('Phantom' as any);
        await connect();
      } catch (err) {
        console.warn('Direct phantom connection failed, opening wallet modal...', err);
        setVisible(true);
      }
      return;
    }
    setBettingOn({ lineId, type });
  };

  const handlePlaceBet = () => {
    if (bettingOn) {
      const randSig = Math.random().toString(36).substring(2, 10).toUpperCase();
      setBetReceipt({
        amount: betAmount,
        type: bettingOn.type,
        txSig: `tx_${randSig}…${Math.floor(1000 + Math.random() * 9000)}`,
      });
    }
    setBettingOn(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-end justify-between border-b-2 border-ink pb-3 mb-6">
        <div>
          <h1 className="display text-4xl text-ink">Open Lines</h1>
          {connected && publicKey && (
            <div className="text-xs text-yes mt-1 font-mono flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yes animate-pulse inline-block" />
              Connected: {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
              <button onClick={() => disconnect()} className="underline text-muted hover:text-ink ml-2">
                Disconnect
              </button>
            </div>
          )}
        </div>
        <span className="label">{LINES.length} markets</span>
      </div>

      <div className="space-y-4">
        {LINES.map((line) => (
          <LineRowCard
            key={line.id}
            line={line}
            connected={connected}
            bettingOn={bettingOn}
            betAmount={betAmount}
            setBetAmount={setBetAmount}
            handleBetClick={handleBetClick}
            handlePlaceBet={handlePlaceBet}
            setBettingOn={setBettingOn}
          />
        ))}
      </div>

      {/* Custom Bet Confirmation Modal */}
      {betReceipt && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-card border-2 border-ink max-w-sm w-full p-6 relative">
            <h3 className="display text-2xl text-ink mb-1.5 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-yes rounded-full" />
              Bet Placed
            </h3>
            <p className="text-xs text-muted mb-4 uppercase tracking-wider">
              On-Chain Receipt Confirmed
            </p>
            
            <div className="space-y-2.5 border-t border-b border-line py-4 mb-5">
              <div className="flex justify-between text-sm">
                <span className="label">Amount</span>
                <span className="num font-bold text-ink">{betReceipt.amount} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="label">Position</span>
                <span className={`font-display uppercase font-bold ${betReceipt.type === 'YES' ? 'text-yes' : 'text-no'}`}>
                  {betReceipt.type}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="label">Transaction</span>
                <span className="num text-muted">{betReceipt.txSig}</span>
              </div>
            </div>

            <button
              onClick={() => setBetReceipt(null)}
              className="w-full h-10 bg-ink text-paper font-display uppercase tracking-wider text-sm hover:bg-accent hover:text-paper cursor-pointer transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
