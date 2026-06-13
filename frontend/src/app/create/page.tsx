import type { Metadata } from 'next';
import { CreateChallengeForm } from '@/components/CreateChallengeForm';

export const metadata: Metadata = {
  title: 'Challenge an Influencer — GymCast',
  description: 'Challenge an influencer to a fitness goal and let the market call it.',
};

export default function CreatePage() {
  return (
    <div className="max-w-6xl mx-auto px-5">
      {/* Masthead-style heading */}
      <section className="py-8 border-b border-ink">
        <p className="label">New Bout · The Card</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2 max-w-3xl">Challenge an influencer</h1>
        <p className="text-ink-2 text-sm leading-relaxed mt-3 max-w-2xl">
          Call out an influencer with a hard fitness goal and a deadline, and seed the first bet. If
          they accept, the board stakes SOL on whether they deliver. At the bell, an AI judge reads
          their final proof against the criteria.
        </p>
      </section>

      <section className="py-7">
        <CreateChallengeForm />
      </section>
    </div>
  );
}
