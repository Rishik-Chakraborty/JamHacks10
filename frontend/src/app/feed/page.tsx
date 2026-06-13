import type { Metadata } from 'next';
import { FeedStream } from '@/components/FeedStream';

export const metadata: Metadata = {
  title: 'Feed — the gainsXchange',
  description: 'Posts and progress from every athlete. Like, challenge anyone, and back the lines you believe in.',
};

export default function FeedPage() {
  return (
    <div className="max-w-2xl mx-auto px-5">
      {/* Masthead-style heading */}
      <section className="py-8 border-b border-ink">
        <p className="label">The Wire</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2">Feed</h1>
        <p className="text-ink-2 text-sm leading-relaxed mt-3">
          Posts and progress from every athlete. Like, challenge anyone, and back the lines that pop up below.
        </p>
      </section>

      <section className="py-7">
        <FeedStream />
      </section>
    </div>
  );
}
