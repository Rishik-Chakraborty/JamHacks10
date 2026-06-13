import type { Metadata } from 'next';
import { PortfolioView } from '@/components/PortfolioView';

export const metadata: Metadata = {
  title: 'My Bets — GymCast',
  description: 'Your positions across the board — stakes, live odds, and winnings to claim.',
};

export default function PortfolioPage() {
  return (
    <div className="max-w-6xl mx-auto px-5">
      {/* Masthead-style heading */}
      <section className="py-8 border-b border-ink">
        <p className="label">Your Ledger · The Card</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2 max-w-3xl">My bets</h1>
        <p className="text-ink-2 text-sm leading-relaxed mt-3 max-w-2xl">
          Every line you&rsquo;ve backed, in one place. Track your stakes against live odds, see what
          you&rsquo;ve won and lost, and claim your share of the pot on settled markets.
        </p>
      </section>

      <section className="py-7">
        <PortfolioView />
      </section>
    </div>
  );
}
