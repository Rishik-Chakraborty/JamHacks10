import Link from 'next/link';
import { EditorialImage } from '@/components/ui/EditorialImage';
import { OddsBar } from '@/components/ui/OddsBar';
import { Tag } from '@/components/ui/Tag';

const HERO_IMG =
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=1100&q=70&auto=format&fit=crop';

const STEPS = [
  {
    n: '01',
    t: 'Get a Solana wallet',
    d: 'Install Phantom (a free browser extension), then switch it to DEVNET: open Settings > Developer Settings > Devnet. Devnet is Solana’s test network — nothing here costs real money.',
  },
  {
    n: '02',
    t: 'Get free test SOL',
    d: 'Open a devnet faucet such as faucet.solana.com, paste your wallet address, and request an airdrop. This is play money on devnet — you can grab more whenever you run low.',
  },
  {
    n: '03',
    t: 'Connect',
    d: 'Click Connect in the top bar and approve in Phantom. Your wallet IS your account — no email, no password, no signup. Disconnect any time; nothing is stored on our side.',
  },
  {
    n: '04',
    t: 'Pick a market',
    d: 'Browse the Board, open a market, and read the goal plus the WINNING CONDITION — the exact criteria the AI judge will check against the final photo. Bet on what the evidence will actually show.',
  },
  {
    n: '05',
    t: 'Back YES or NO',
    d: 'In the market’s Bet Module, stake SOL into the YES pool or the NO pool. Odds are parimutuel: the split between the two pools is the implied probability, and winners split the losing pool in proportion to their stake.',
  },
  {
    n: '06',
    t: 'Watch it play out',
    d: 'The athlete posts daily proof photos. Streaks and missed days move the line and the Hype Meter, so the odds shift as the deadline approaches and the crowd reacts to the evidence.',
  },
  {
    n: '07',
    t: 'Claim',
    d: 'When the deadline hits, an AI vision oracle judges the final photo against the winning condition. If your side wins, head to your My Bets page and claim your payout from the pot.',
  },
];

export default function HowItWorksPage() {
  return (
    <div>
      {/* ---------------- HEADER ---------------- */}
      <section className="max-w-6xl mx-auto px-5 pt-8 pb-10">
        <div className="grid lg:grid-cols-12 gap-8 items-end border-b-2 border-ink pb-8">
          <div className="lg:col-span-8">
            <p className="label">For spectators · The spread sheet</p>
            <h1 className="display text-[2.75rem] sm:text-6xl text-ink mt-3 leading-[0.92]">
              How to bet
              <br />
              <span className="text-accent">on GymCast.</span>
            </h1>
            <p className="text-lg text-ink-2 mt-6 max-w-2xl leading-relaxed">
              GymCast is a fitness prediction market. Athletes put a goal and a deadline on the
              board; you stake SOL on whether they’ll deliver. Seven steps from cold open to
              cashing out — start to finish, no house edge.
            </p>
          </div>
          <div className="lg:col-span-4">
            <EditorialImage
              src={HERO_IMG}
              alt="Spectators watching the line move"
              className="h-56 lg:h-64 border border-ink"
            />
          </div>
        </div>
      </section>

      {/* ---------------- THE WALKTHROUGH ---------------- */}
      <section className="max-w-6xl mx-auto px-5 pb-4">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3 mb-6">
          <h2 className="display text-3xl sm:text-4xl text-ink">The run sheet</h2>
          <span className="label hidden sm:block">Seven steps</span>
        </div>
        <div className="border border-line bg-card divide-y divide-line">
          {STEPS.map((s) => (
            <div key={s.n} className="grid sm:grid-cols-12 gap-4 sm:gap-6 p-5 sm:p-6">
              <div className="sm:col-span-2 flex sm:block items-baseline gap-3">
                <div className="num text-4xl sm:text-5xl text-accent leading-none">{s.n}</div>
                <div className="rule-ink w-8 mt-0 sm:mt-3" />
              </div>
              <div className="sm:col-span-10">
                <h3 className="display text-2xl text-ink">{s.t}</h3>
                <p className="text-base text-ink-2 mt-2 leading-relaxed max-w-3xl">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- PARIMUTUEL + DEVNET NOTES ---------------- */}
      <section className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid lg:grid-cols-12 gap-px bg-line border border-line">
          {/* What is parimutuel? */}
          <div className="lg:col-span-8 bg-card p-6 sm:p-8">
            <p className="label">The fine print</p>
            <h2 className="display text-2xl sm:text-3xl text-ink mt-2">What is parimutuel?</h2>
            <p className="text-base text-ink-2 mt-3 leading-relaxed max-w-2xl">
              There is no bookmaker and no fixed odds. Every YES stake goes into one pool, every NO
              stake into another. The split between the two pools is the implied probability — if
              the YES pool is bigger, the crowd thinks YES is more likely. When the market settles,
              the winning side splits the entire losing pool in proportion to how much each person
              staked. Back the underdog early and a small stake can return a large share.
            </p>
            <div className="mt-6 max-w-md">
              <div className="label mb-2">Example line</div>
              <OddsBar impliedYes={0.62} />
              <p className="text-sm text-muted mt-2 leading-relaxed">
                YES holds <span className="num">62%</span> of the pool, so the market implies a{' '}
                <span className="num">62%</span> chance the athlete delivers. If YES wins, that side
                divides the NO pool between its backers.
              </p>
            </div>
          </div>

          {/* Devnet note */}
          <div className="lg:col-span-4 bg-paper-2 p-6 sm:p-8 flex flex-col">
            <div className="flex items-center gap-2">
              <Tag tone="accent" solid>
                Devnet
              </Tag>
              <Tag tone="muted">Not real money</Tag>
            </div>
            <h3 className="display text-xl text-ink mt-4">Play money, real practice</h3>
            <p className="text-sm text-ink-2 mt-2 leading-relaxed">
              GymCast runs on Solana <span className="num">devnet</span>. The SOL you stake is free
              test SOL from a faucet — it has no cash value and never touches your real wallet
              balance. Bet freely, learn the mechanics, and reload from the faucet whenever you run
              dry.
            </p>
            <div className="rule mt-auto pt-4">
              <p className="label">Faucet</p>
              <p className="num text-sm text-ink-2 mt-1">faucet.solana.com</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- CLOSING CTAs ---------------- */}
      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="border-2 border-ink bg-card px-6 sm:px-10 py-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <p className="label">Ready to call it</p>
            <h2 className="display text-3xl sm:text-4xl text-ink leading-none mt-2">
              Find a line you <span className="text-accent">believe in.</span>
            </h2>
            <p className="text-ink-2 mt-3 max-w-lg">
              The board is open. Read the conditions, weigh the odds, and back your read.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/"
              className="inline-flex h-12 items-center px-6 bg-accent text-paper border border-accent font-display uppercase tracking-wide text-lg hover:bg-accent-deep transition-colors"
            >
              Browse the Board
            </Link>
            <Link
              href="/portfolio"
              className="inline-flex h-12 items-center px-6 bg-transparent text-ink border border-ink font-display uppercase tracking-wide text-lg hover:bg-ink hover:text-paper transition-colors"
            >
              See my bets
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
