/**
 * /create — page shell for starting a new challenge. Server Component.
 * The interactive form (wallet + on-chain market init) is a client component.
 */
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { CreateChallengeForm } from '@/components/CreateChallengeForm';

export default function CreatePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-3">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back to feed
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Start a <span className="text-gradient">Challenge</span>
          </h1>
          <Badge tone="accent">Parimutuel</Badge>
        </div>
        <p className="text-sm text-muted">
          Put a fitness goal on the line. The crowd bets YES/NO and an AI oracle
          settles the market when your deadline hits.
        </p>
      </div>
      <CreateChallengeForm />
    </div>
  );
}
