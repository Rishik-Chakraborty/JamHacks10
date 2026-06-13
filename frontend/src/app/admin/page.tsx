/* ==========================================================================
   /admin — Settlement & P/L view (hardcoded demo)
   ========================================================================== */

/**
 * Parimutuel math:
 *   YES pool = 12.5 SOL, NO pool = 8.2 SOL, Total = 20.7 SOL
 *   Outcome = YES
 *   YES winners get: stake + (stake / yesPool) * noPool
 *   NO losers get: 0 (they lose their entire stake)
 */

const BETTORS = [
  {
    wallet: '9wha1Ek2…4Fg4H',
    username: 'SolWhale',
    side: 'yes' as const,
    stake: 5.0,
    payout: 8.28,
    pnl: +3.28,
  },
  {
    wallet: '3dmd8Xq2…7Rt2P',
    username: 'DiamondHands',
    side: 'yes' as const,
    stake: 3.5,
    payout: 5.80,
    pnl: +2.30,
  },
  {
    wallet: '7gymBRoX…uVwXy',
    username: 'Ryan',
    side: 'yes' as const,
    stake: 2.0,
    payout: 3.31,
    pnl: +1.31,
  },
  {
    wallet: '8crY9Zab…mN3q4',
    username: 'CryptoChad',
    side: 'yes' as const,
    stake: 2.0,
    payout: 3.31,
    pnl: +1.31,
  },
  {
    wallet: '4skEpT1c…v8W9',
    username: 'FudFred',
    side: 'no' as const,
    stake: 4.0,
    payout: 0,
    pnl: -4.0,
  },
  {
    wallet: '6skPtSam…jK7m',
    username: 'SkepticalSam',
    side: 'no' as const,
    stake: 2.5,
    payout: 0,
    pnl: -2.5,
  },
  {
    wallet: '2pPrHnds…qR5s',
    username: 'PaperHands',
    side: 'no' as const,
    stake: 1.7,
    payout: 0,
    pnl: -1.7,
  },
];

export default function AdminPage() {
  const totalPot = 20.7;
  const yesPool = 12.5;
  const noPool = 8.2;
  const totalBets = BETTORS.length;

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      {/* Header */}
      <div className="border-b-2 border-ink pb-3 mb-8">
        <div className="label mb-2">Admin · Settlement Report</div>
        <h1 className="display text-4xl sm:text-5xl text-ink">
          Will his abs be visible by the end of the year?
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-display uppercase text-xs tracking-wider leading-none bg-yes text-paper border-yes">
            Settled — YES
          </span>
          <span className="label">Resolved Dec 28, 2025</span>
          <span className="label">by AI Oracle (GPT-5 Vision)</span>
        </div>
      </div>

      {/* Oracle verdict */}
      <div className="bg-card border-2 border-yes p-5 mb-8">
        <div className="label text-yes mb-2">AI Oracle Verdict</div>
        <p className="text-ink leading-relaxed">
          &quot;The submitted photo clearly shows defined abdominal muscles with visible
          separation between the rectus abdominis segments. Vascularity is present in
          the lower obliques. Body fat percentage estimated at 12-14%, consistent with
          visible abs. <strong>Goal met with high confidence (0.94).</strong>&quot;
        </p>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line">
          <span className="num text-sm text-yes font-semibold">
            Confidence: 0.94
          </span>
          <span className="num text-sm text-muted">
            Model: gpt-5-vision
          </span>
          <span className="num text-sm text-muted">
            Tx: 4xK9…mR2p
          </span>
        </div>
      </div>

      {/* Market stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-line border border-line mb-8">
        <div className="bg-card p-4">
          <div className="label">Total pot</div>
          <div className="num text-2xl text-ink mt-1">{totalPot} SOL</div>
        </div>
        <div className="bg-card p-4">
          <div className="label">Yes pool</div>
          <div className="num text-2xl text-yes mt-1">{yesPool} SOL</div>
        </div>
        <div className="bg-card p-4">
          <div className="label">No pool</div>
          <div className="num text-2xl text-no mt-1">{noPool} SOL</div>
        </div>
        <div className="bg-card p-4">
          <div className="label">Total bets</div>
          <div className="num text-2xl text-ink mt-1">{totalBets}</div>
        </div>
        <div className="bg-card p-4">
          <div className="label">Payout mult.</div>
          <div className="num text-2xl text-yes mt-1">1.66×</div>
        </div>
      </div>

      {/* Bettor P&L table */}
      <div className="border-b-2 border-ink pb-2 mb-0">
        <div className="flex items-end justify-between">
          <h2 className="display text-2xl text-ink">Bettor Ledger</h2>
          <span className="label">{totalBets} positions</span>
        </div>
      </div>

      <div className="border border-line border-t-0">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-0 bg-paper-2 border-b border-line px-4 py-2.5">
          <div className="col-span-3 label text-xs">Bettor</div>
          <div className="col-span-2 label text-xs">Wallet</div>
          <div className="col-span-1 label text-xs text-center">Side</div>
          <div className="col-span-2 label text-xs text-right">Stake</div>
          <div className="col-span-2 label text-xs text-right">Payout</div>
          <div className="col-span-2 label text-xs text-right">P / L</div>
        </div>

        {/* Table rows */}
        {BETTORS.map((b, i) => (
          <div
            key={b.username}
            className={`grid grid-cols-12 gap-0 px-4 py-3 items-center ${
              i < BETTORS.length - 1 ? 'border-b border-line' : ''
            } ${b.side === 'yes' ? 'bg-card' : 'bg-paper'}`}
          >
            <div className="col-span-3">
              <span className="font-display uppercase text-sm font-bold tracking-wide text-ink">
                {b.username}
              </span>
            </div>
            <div className="col-span-2">
              <span className="num text-xs text-muted">{b.wallet}</span>
            </div>
            <div className="col-span-1 text-center">
              <span
                className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-display uppercase text-xs tracking-wider leading-none ${
                  b.side === 'yes'
                    ? 'text-yes border-yes'
                    : 'text-no border-no'
                }`}
              >
                {b.side}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <span className="num text-sm text-ink">
                {b.stake.toFixed(2)} SOL
              </span>
            </div>
            <div className="col-span-2 text-right">
              <span
                className={`num text-sm ${
                  b.payout > 0 ? 'text-yes' : 'text-muted'
                }`}
              >
                {b.payout > 0 ? `${b.payout.toFixed(2)} SOL` : '—'}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <span
                className={`num text-sm font-bold ${
                  b.pnl > 0 ? 'text-yes' : 'text-no'
                }`}
              >
                {b.pnl > 0 ? '+' : ''}
                {b.pnl.toFixed(2)} SOL
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div className="grid grid-cols-2 gap-px bg-line border border-line border-t-0 mt-0">
        <div className="bg-card p-4">
          <div className="label">Winners paid out</div>
          <div className="num text-xl text-yes mt-1">
            +{BETTORS.filter((b) => b.pnl > 0)
              .reduce((s, b) => s + b.pnl, 0)
              .toFixed(2)}{' '}
            SOL
          </div>
          <div className="text-xs text-muted mt-1">
            {BETTORS.filter((b) => b.pnl > 0).length} winning positions
          </div>
        </div>
        <div className="bg-card p-4">
          <div className="label">Losers liquidated</div>
          <div className="num text-xl text-no mt-1">
            {BETTORS.filter((b) => b.pnl < 0)
              .reduce((s, b) => s + b.pnl, 0)
              .toFixed(2)}{' '}
            SOL
          </div>
          <div className="text-xs text-muted mt-1">
            {BETTORS.filter((b) => b.pnl < 0).length} losing positions
          </div>
        </div>
      </div>

      {/* On-chain receipts */}
      <div className="mt-8 border-t-2 border-ink pt-4">
        <div className="label mb-3">On-Chain Settlement Transactions</div>
        <div className="space-y-2">
          {BETTORS.filter((b) => b.pnl > 0).map((b) => (
            <div
              key={b.username}
              className="flex items-center justify-between bg-card border border-line px-4 py-2"
            >
              <span className="num text-sm text-ink">{b.username}</span>
              <span className="num text-sm text-yes">
                → {b.payout.toFixed(2)} SOL claimed
              </span>
              <span className="num text-xs text-muted">
                Solana Explorer ↗
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
