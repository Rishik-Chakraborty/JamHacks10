/**
 * Landing / feed shell. Server Component.
 *
 * This file owns only the page chrome: hero + the mount point where the live
 * feed renders. The feed itself is built by another agent — it should render a
 * client component inside the `#feed` section below (e.g. <Feed /> listing
 * challenges from `api.listChallenges()` + socket TICKER updates).
 */
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Feed } from '@/components/Feed';

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
        <Badge tone="brand" pulse>
          Live on Solana devnet
        </Badge>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Set the goal. <span className="text-gradient">Let the crowd</span> bet
          you can&apos;t.
        </h1>
        <p className="max-w-xl text-base text-muted sm:text-lg">
          GymCast is BeReal × Polymarket for fitness. Post your progress daily,
          watch the Hype Meter climb, and let an AI oracle settle the
          parimutuel market when the deadline hits.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/create">
            <Button variant="accent" size="lg">
              Start a Challenge
            </Button>
          </Link>
          <a href="#feed">
            <Button variant="outline" size="lg">
              Browse Live Markets
            </Button>
          </a>
        </div>
      </section>

      {/* Feed mount point — owned by the feed agent. */}
      <section id="feed" className="pb-24">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Live Challenges</h2>
          <Badge tone="accent">Parimutuel</Badge>
        </div>
        <Feed />
      </section>
    </div>
  );
}
