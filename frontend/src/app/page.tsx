import Link from 'next/link';
import { Feed } from '@/components/Feed';
import { StatsBand } from '@/components/StatsBand';

export default function HomePage() {
  return (
    <div>
      {/* ---------------- HERO ---------------- */}
      <section className="max-w-6xl mx-auto px-5 pt-10 pb-8">
        <p className="label">Bet on the grind</p>
        <h1 className="display text-[3rem] sm:text-7xl text-ink mt-3 leading-[0.9] max-w-4xl">
          Challenge the influencers. <span className="text-accent">Bet on whether they deliver.</span>
        </h1>
        <p className="text-lg text-ink-2 mt-6 max-w-2xl leading-relaxed">
          the gainsXchange turns fitness call-outs into live markets. Challenge an influencer to a goal,
          seed the first bet, and let the crowd stake SOL on YES or NO. The influencer posts proof, an AI
          judge rules, and the winners take the pot — the influencer never bets, they just earn the cut.
        </p>
        <div className="flex flex-wrap gap-3 mt-7">
          <Link
            href="/feed"
            className="inline-flex h-12 items-center px-7 bg-accent text-paper border border-accent font-display uppercase tracking-wide text-lg hover:bg-accent-deep transition-colors"
          >
            Open the feed
          </Link>
          <a
            href="#board"
            className="inline-flex h-12 items-center px-7 bg-ink text-paper border border-ink font-display uppercase tracking-wide text-lg hover:bg-accent hover:border-accent transition-colors"
          >
            Browse open lines
          </a>
        </div>
      </section>

      <StatsBand />

      {/* ---------------- THE BOARD ---------------- */}
      <section id="board" className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-end justify-between border-b-2 border-ink pb-3 mb-6">
          <h2 className="display text-3xl sm:text-4xl text-ink">Open lines</h2>
          <span className="label">Live markets · Back a side</span>
        </div>
        <Feed />
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="border-t-2 border-ink">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <div className="display text-2xl text-ink leading-none">
              the gains<span className="text-accent">Xchange</span>
            </div>
            <p className="label mt-1">Bet on the grind</p>
          </div>
          <div className="flex gap-10">
            <div>
              <div className="label mb-2">Explore</div>
              <ul className="space-y-1 text-sm text-ink-2">
                <li><Link href="/feed" className="hover:text-accent">Feed</Link></li>
                <li><a href="#board" className="hover:text-accent">Open lines</a></li>
                <li><Link href="/portfolio" className="hover:text-accent">My bets</Link></li>
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
