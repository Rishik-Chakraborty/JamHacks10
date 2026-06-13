import type { Metadata } from 'next';
import { OpenLines } from '@/components/OpenLines';

export const metadata: Metadata = {
  title: 'Open Lines — GymCast',
  description: 'Live lines on influencers, ranked for you.',
};

export default function LinesPage() {
  return (
    <div className="max-w-6xl mx-auto px-5">
      <section className="py-8 border-b border-ink">
        <p className="label">Discovery · Suggested for you</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2 max-w-3xl">Open lines</h1>
        <p className="text-ink-2 text-sm leading-relaxed mt-3 max-w-2xl">
          Live lines on influencers, ranked by who you follow, what&rsquo;s heating up, and which
          calls are still a genuine coin-flip. Back a side before the bell.
        </p>
      </section>

      <section className="py-7">
        <OpenLines />
      </section>
    </div>
  );
}
