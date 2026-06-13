import type { Metadata } from 'next';
import { FeedStream } from '@/components/FeedStream';

export const metadata: Metadata = {
  title: 'The Feed — GymCast',
  description: 'Progress proof from across the board — the latest shots, live odds, and the lines you can back.',
};

export default function FeedPage() {
  return (
    <div className="max-w-6xl mx-auto px-5">
      {/* Masthead-style heading */}
      <section className="py-8 border-b border-ink">
        <p className="label">The Wire · Live Proof</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2 max-w-3xl">The feed</h1>
        <p className="text-ink-2 text-sm leading-relaxed mt-3 max-w-2xl">
          Every progress shot as it lands. Watch the proof roll in, like the lines you believe in,
          and back the bets you can&rsquo;t — one scroll, one card at a time.
        </p>
      </section>

      <section className="py-7">
        <FeedStream />
      </section>
    </div>
  );
}
