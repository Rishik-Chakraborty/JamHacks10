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

const STEPS = [
  { n: '01', t: 'Open a line', d: 'An athlete posts a goal and a deadline — a bench PR, a body-weight cut, a visible vein. A parimutuel market opens on Solana.' },
  { n: '02', t: 'The market forms', d: 'Spectators stake SOL on YES or NO. Odds are pure pool share — no house, no maker. Money moves the line in real time.' },
  { n: '03', t: 'Daily proof', d: 'The athlete posts timestamped progress photos. Streaks lift the Hype Meter; missed days drag it down and shift sentiment.' },
  { n: '04', t: 'The judge settles', d: 'At the deadline an AI vision oracle reads the final photo against the written criteria. Winners split the entire pot.' },
];

const RULES = [
  { k: 'Accountability', t: 'Skin in the game', d: 'Public goals plus other people’s money make discipline non-negotiable. The doubters are watching every rep.' },
  { k: 'Parimutuel odds', t: 'The crowd sets the line', d: 'No bookmaker. The split between the YES and NO pools is the implied probability — and your share of the losing side.' },
  { k: 'AI oracle', t: 'Proof, not promises', d: 'A vision model judges the final evidence against precise success criteria. Low-confidence calls go to human review before settlement.' },
];

export default function HomePage() {
  return (
    <div>
      {/* ---------------- HERO — type-first, asymmetric ---------------- */}
      <section className="max-w-6xl mx-auto px-5 pt-8 pb-10">
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col">
            <p className="label">Back your discipline · Doubt theirs</p>
            <h1 className="display text-[3.25rem] sm:text-7xl text-ink mt-3 leading-[0.9]">
              Put your goals
              <br />
              on the board.
              <br />
              <span className="text-accent">Let the market</span>
              <br />
              call your bluff.
            </h1>
            <p className="text-lg text-ink-2 mt-6 max-w-xl leading-relaxed">
              GymCast turns personal fitness milestones into public, tradable markets. Athletes commit
              to a deadline. Spectators stake SOL on whether they’ll deliver. An AI judge reads the
              proof — and the winners take the pot.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link
                href="/create"
                className="inline-flex h-12 items-center px-6 bg-accent text-paper border border-accent font-display uppercase tracking-wide text-lg hover:bg-accent-deep transition-colors"
              >
                Open a line
              </Link>
              <a
                href="#board"
                className="inline-flex h-12 items-center px-6 bg-transparent text-ink border border-ink font-display uppercase tracking-wide text-lg hover:bg-ink hover:text-paper transition-colors"
              >
                Browse the board
              </a>
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

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3">
          <h2 className="display text-3xl sm:text-4xl text-ink">How the house runs</h2>
          <span className="label hidden sm:block">Four rounds</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line mt-6">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-card p-5">
              <div className="num text-2xl text-accent">{s.n}</div>
              <h3 className="display text-xl text-ink mt-3">{s.t}</h3>
              <p className="text-sm text-ink-2 mt-2 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- THE BOARD ---------------- */}
      <section id="board" className="max-w-6xl mx-auto px-5 pb-12">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3 mb-6">
          <h2 className="display text-3xl sm:text-4xl text-ink">The Board</h2>
          <span className="label">Open Markets</span>
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

      {/* ---------------- CLOSING CTA ---------------- */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="border-2 border-ink bg-card px-6 sm:px-10 py-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="display text-3xl sm:text-5xl text-ink leading-none">
              Think you’ll <span className="text-accent">make it?</span>
            </h2>
            <p className="text-ink-2 mt-3 max-w-lg">
              Stake your reputation. Open a line, set a deadline, and let the doubters fund your podium.
            </p>
          </div>
          <Link
            href="/create"
            className="inline-flex h-12 items-center px-7 bg-ink text-paper border border-ink font-display uppercase tracking-wide text-lg hover:bg-accent hover:border-accent transition-colors shrink-0"
          >
            Open a line
          </Link>
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
                <li><Link href="/" className="hover:text-accent">The Board</Link></li>
                <li><Link href="/create" className="hover:text-accent">Open a Line</Link></li>
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
