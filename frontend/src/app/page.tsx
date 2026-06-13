import Link from 'next/link';
import { Feed } from '@/components/Feed';
import { StatsBand } from '@/components/StatsBand';
import { EditorialImage } from '@/components/ui/EditorialImage';
import { OddsBar } from '@/components/ui/OddsBar';
import { Tag } from '@/components/ui/Tag';

const HERO_IMG =
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1100&q=70&auto=format&fit=crop';
const RULES_IMG =
  'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=1000&q=70&auto=format&fit=crop';

/* Two-perspective explainer — the house runs the same loop for both sides. */
const ATHLETE_STEPS = [
  { n: '01', t: 'Open a line', d: 'Post a goal and a deadline — a bench PR, a body-weight cut, a visible vein. A parimutuel market opens on Solana.' },
  { n: '02', t: 'Post daily proof', d: 'Drop timestamped progress photos. Streaks lift the Hype Meter and pull the line toward YES; missed days drag it down.' },
  { n: '03', t: 'Hit the deadline', d: 'Submit the final photo. An AI vision oracle reads it against your written criteria and settles the market.' },
  { n: '04', t: 'Bank the proof', d: 'Deliver and your record stands on-chain. The doubters who shorted you funded the pot you just defended.' },
];

const BETTOR_STEPS = [
  { n: '01', t: 'Connect a wallet', d: 'No signup. Connect a Solana wallet — it IS your account. Your positions, history and payouts all live on-chain.' },
  { n: '02', t: 'Read the board', d: 'Browse open lines. The YES/NO split is the crowd-implied probability; the Hype Meter shows real momentum, not hype.' },
  { n: '03', t: 'Stake YES or NO', d: 'Back the athlete or doubt them. Bets are placed on each market’s page. Odds are pure pool share — no house, no maker.' },
  { n: '04', t: 'Claim if right', d: 'When the oracle settles, the winning side splits the entire pot pro-rata. Claim your share back to your wallet.' },
];

/* Concise spectator on-ramp — connect > pick > stake > claim. */
const BET_STRIP = [
  { n: '01', t: 'Connect wallet', d: 'Wallet is your account — no email, no password.' },
  { n: '02', t: 'Pick a market', d: 'Choose an open line from the board.' },
  { n: '03', t: 'Stake YES / NO', d: 'Back belief or doubt on the market page.' },
  { n: '04', t: 'Claim if right', d: 'Winners split the pot when it settles.' },
];

const RULES = [
  { k: 'Accountability', t: 'Skin in the game', d: 'Public goals plus other people’s money make discipline non-negotiable. The doubters are watching every rep.' },
  { k: 'Parimutuel odds', t: 'The crowd sets the line', d: 'No bookmaker. The split between the YES and NO pools is the implied probability — and your share of the losing side.' },
  { k: 'AI oracle', t: 'Proof, not promises', d: 'A vision model judges the final evidence against precise success criteria. Low-confidence calls go to human review before settlement.' },
];

export default function HomePage() {
  return (
    <div>
      {/* ---------------- HERO — type-first, two equal audiences ---------------- */}
      <section className="max-w-6xl mx-auto px-5 pt-8 pb-10">
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col">
            <p className="label">Back your discipline · Doubt theirs</p>
            <h1 className="display text-[3.25rem] sm:text-7xl text-ink mt-3 leading-[0.9]">
              Goals on
              <br />
              the board.
              <br />
              <span className="text-accent">Money on</span>
              <br />
              the outcome.
            </h1>
            <p className="text-lg text-ink-2 mt-6 max-w-xl leading-relaxed">
              GymCast turns personal fitness milestones into public, tradable markets. Athletes commit
              to a deadline. Spectators stake SOL on whether they’ll deliver. An AI judge reads the
              proof — and the winners take the pot.
            </p>

            {/* Two equally-weighted paths */}
            <div className="grid sm:grid-cols-2 gap-px bg-line border border-ink mt-8">
              {/* Athletes */}
              <div className="bg-card p-5 flex flex-col">
                <Tag tone="accent">For athletes</Tag>
                <h2 className="display text-xl text-ink mt-3">Stake your reputation</h2>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed flex-1">
                  Commit to a goal and a deadline. Let the doubters fund your podium.
                </p>
                <Link
                  href="/create"
                  className="inline-flex h-11 items-center justify-center px-5 mt-4 bg-accent text-paper border border-accent font-display uppercase tracking-wide text-base hover:bg-accent-deep transition-colors"
                >
                  Open a line
                </Link>
              </div>

              {/* Bettors / spectators */}
              <div className="bg-card p-5 flex flex-col">
                <Tag tone="ink">For bettors</Tag>
                <h2 className="display text-xl text-ink mt-3">Call their bluff</h2>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed flex-1">
                  Read the line, stake SOL on YES or NO, and claim the pot if you’re right.
                </p>
                <a
                  href="#board"
                  className="inline-flex h-11 items-center justify-center px-5 mt-4 bg-ink text-paper border border-ink font-display uppercase tracking-wide text-base hover:bg-accent hover:border-accent transition-colors"
                >
                  Back a line
                </a>
                <Link href="/how-it-works" className="label mt-3 hover:text-accent transition-colors">
                  New to betting? →
                </Link>
              </div>
            </div>
          </div>

          {/* Hero figure with an overlaid mini-line */}
          <div className="lg:col-span-5">
            <EditorialImage src={HERO_IMG} alt="Athlete training under load" className="h-72 lg:h-full min-h-[20rem] border border-ink" />
            <div className="border-x border-b border-ink bg-card p-4">
              <div className="flex items-center justify-between">
                <Tag tone="accent" solid>Sample line</Tag>
                <span className="label">Closes in 14d</span>
              </div>
              <p className="display text-xl text-ink mt-2">Visible bicep vein by month end</p>
              <div className="mt-3">
                <OddsBar impliedYes={0.62} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- LIVE STATS (full-bleed ink band) ---------------- */}
      <StatsBand />

      {/* ---------------- HOW THE HOUSE RUNS — both perspectives ---------------- */}
      <section className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3">
          <h2 className="display text-3xl sm:text-4xl text-ink">How the house runs</h2>
          <span className="label hidden sm:block">Two sides · One loop</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mt-6">
          {/* For athletes */}
          <div>
            <div className="flex items-center gap-3 pb-3">
              <Tag tone="accent" solid>For athletes</Tag>
              <span className="label">Build the line</span>
            </div>
            <div className="grid gap-px bg-line border border-line">
              {ATHLETE_STEPS.map((s) => (
                <div key={s.n} className="bg-card p-5 flex gap-4">
                  <div className="num text-2xl text-accent shrink-0">{s.n}</div>
                  <div>
                    <h3 className="display text-lg text-ink">{s.t}</h3>
                    <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* For bettors */}
          <div>
            <div className="flex items-center gap-3 pb-3">
              <Tag tone="ink" solid>For bettors</Tag>
              <span className="label">Read the line</span>
            </div>
            <div className="grid gap-px bg-line border border-line">
              {BETTOR_STEPS.map((s) => (
                <div key={s.n} className="bg-card p-5 flex gap-4">
                  <div className="num text-2xl text-ink shrink-0">{s.n}</div>
                  <div>
                    <h3 className="display text-lg text-ink">{s.t}</h3>
                    <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-sm text-muted mt-4 max-w-2xl leading-relaxed">
          No signup, ever — your Solana wallet is your account. Betting happens on each market’s page once
          your wallet is connected.
        </p>
      </section>

      {/* ---------------- BETTING IN 4 STEPS — spectator on-ramp ---------------- */}
      <section className="bg-paper-2 border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <div className="flex items-end justify-between border-b-2 border-ink pb-3">
            <h2 className="display text-3xl sm:text-4xl text-ink">Betting in four steps</h2>
            <Link href="/how-it-works" className="label hover:text-accent transition-colors">
              New to betting? →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line mt-6">
            {BET_STRIP.map((s) => (
              <div key={s.n} className="bg-card p-5">
                <div className="num text-2xl text-accent">{s.n}</div>
                <h3 className="display text-lg text-ink mt-3">{s.t}</h3>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- THE BOARD ---------------- */}
      <section id="board" className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3 mb-6">
          <h2 className="display text-3xl sm:text-4xl text-ink">The Board</h2>
          <span className="label">Open Markets · Back a line</span>
        </div>
        <Feed />
      </section>

      {/* ---------------- THE RULES OF THE HOUSE ---------------- */}
      <section className="bg-paper-2 border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-12 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-4">
            <EditorialImage src={RULES_IMG} alt="Track and discipline" className="h-64 lg:h-80 border border-ink" />
          </div>
          <div className="lg:col-span-8">
            <p className="label">Why it works</p>
            <h2 className="display text-3xl sm:text-4xl text-ink mt-2">Discipline, priced by the crowd</h2>
            <div className="grid sm:grid-cols-3 gap-px bg-line border border-line mt-6">
              {RULES.map((r) => (
                <div key={r.k} className="bg-card p-5">
                  <div className="rule-accent w-8 mb-3" />
                  <div className="label">{r.k}</div>
                  <h3 className="display text-lg text-ink mt-1">{r.t}</h3>
                  <p className="text-sm text-ink-2 mt-2 leading-relaxed">{r.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- CLOSING CTA — both paths ---------------- */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="border-2 border-ink bg-card px-6 sm:px-10 py-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="display text-3xl sm:text-5xl text-ink leading-none">
              Pick a side. <span className="text-accent">Prove it.</span>
            </h2>
            <p className="text-ink-2 mt-3 max-w-lg">
              Athletes open the line. Bettors call the bluff. The AI judge settles it and the winners
              take the pot — no signup, just a wallet.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/create"
              className="inline-flex h-12 items-center px-7 bg-accent text-paper border border-accent font-display uppercase tracking-wide text-lg hover:bg-accent-deep transition-colors"
            >
              Open a line
            </Link>
            <a
              href="#board"
              className="inline-flex h-12 items-center px-7 bg-ink text-paper border border-ink font-display uppercase tracking-wide text-lg hover:bg-accent hover:border-accent transition-colors"
            >
              Back a line
            </a>
          </div>
        </div>
      </section>

      {/* ---------------- COLOPHON / FOOTER ---------------- */}
      <footer className="border-t-2 border-ink">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <div className="display text-2xl text-ink leading-none">
              Gym<span className="text-accent">Cast</span>
            </div>
            <p className="label mt-1">The Fitness Prediction Market</p>
          </div>
          <div className="flex gap-10">
            <div>
              <div className="label mb-2">Market</div>
              <ul className="space-y-1 text-sm text-ink-2">
                <li><a href="#board" className="hover:text-accent">The Board</a></li>
                <li><Link href="/create" className="hover:text-accent">Open a Line</Link></li>
                <li><Link href="/how-it-works" className="hover:text-accent">How It Works</Link></li>
              </ul>
            </div>
            <div>
              <div className="label mb-2">Built on</div>
              <ul className="space-y-1 text-sm text-ink-2 num">
                <li>Solana · Devnet</li>
                <li>MongoDB · OpenAI</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
