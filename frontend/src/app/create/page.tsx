import type { Metadata } from 'next';
import { CreateChallengeForm } from '@/components/CreateChallengeForm';

export const metadata: Metadata = {
  title: 'Open a Line — GymCast',
  description: 'Put a fitness goal on the board and let the market call your bluff.',
};

export default function CreatePage() {
  return (
    <div className="max-w-6xl mx-auto px-5">
      {/* Masthead-style heading */}
      <section className="py-8 border-b border-ink">
        <p className="label">New Bout · The Card</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2 max-w-3xl">Open a line</h1>
        <p className="text-ink-2 text-sm leading-relaxed mt-3 max-w-2xl">
          Declare a real fitness goal with a hard deadline. Spectators will stake SOL on whether you
          deliver. At the bell, an AI judge reads your final proof against the criteria you set.
        </p>
      </section>

      <section className="py-7">
        <CreateChallengeForm />
      </section>
    </div>
  );
}
