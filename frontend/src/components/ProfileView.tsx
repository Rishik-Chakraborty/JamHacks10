'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import { formatSol, shortWallet } from '@/lib/format';
import type { Profile, Challenge, FeedPost } from '@/types/contract';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';
import { Stat } from '@/components/ui/Stat';
import { ChallengeCard } from '@/components/ChallengeCard';
import { EditProfile } from '@/components/EditProfile';
import { mediaSrc, isVideo } from '@/lib/media';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/** Two uppercase initials for the avatar fallback. */
function initials(handle: string): string {
  const clean = handle.replace(/[^a-zA-Z0-9]/g, '');
  return clean.slice(0, 2).toUpperCase() || '??';
}

export function ProfileView({ wallet }: { wallet: string }) {
  const { publicKey } = useWallet();
  const viewerWallet = publicKey?.toBase58();
  const isOwn = viewerWallet === wallet;

  const { data, isLoading, isError, error, refetch } = useQuery<Profile>({
    queryKey: ['profile', wallet],
    queryFn: () => api.getProfile(wallet, viewerWallet),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex items-end gap-5 border-b border-ink pb-8">
          <div className="w-28 h-28 sm:w-36 sm:h-36 bg-paper-2 border border-line animate-pulse" />
          <div className="flex-1">
            <div className="h-10 w-64 bg-paper-2 animate-pulse" />
            <div className="h-4 w-40 bg-paper-2 mt-3 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border border-line mt-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="border border-no bg-no-soft p-6 max-w-2xl">
          <p className="display text-xl text-no">Couldn&rsquo;t load this profile</p>
          <p className="text-sm text-ink-2 mt-1">
            {error instanceof Error ? error.message : 'Request failed.'} Is the API running at{' '}
            <code className="num">{API}</code>?
          </p>
          <button onClick={() => refetch()} className="label mt-3 underline hover:text-no">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { user, challenges, posts } = data;
  const handle = user?.username || shortWallet(wallet);
  const totalPool = challenges.reduce((sum, c) => sum + c.yesPoolLamports + c.noPoolLamports, 0);

  const active = challenges.filter((c) => c.status === 'active');
  const settled = challenges.filter((c) => c.status !== 'active');

  return (
    <div className="max-w-6xl mx-auto px-5">
      {/* --- Profile masthead --------------------------------------------- */}
      <section className="py-8 border-b border-ink">
        <p className="label">Athlete · The Card</p>

        <div className="flex flex-col sm:flex-row sm:items-end gap-5 mt-4">
          {/* Avatar */}
          <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 border border-line bg-ink">
            {user?.avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={user.avatar}
                alt={handle}
                className="block w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="display text-4xl sm:text-5xl text-paper">{initials(handle)}</span>
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="display text-4xl sm:text-6xl text-ink break-words">{handle}</h1>
              {isOwn && <Tag tone="accent">This is you</Tag>}
            </div>
            <p className="num text-sm text-muted mt-2 break-all">{wallet}</p>
            {user?.bio && (
              <p className="text-ink-2 text-sm leading-relaxed mt-3 max-w-2xl">{user.bio}</p>
            )}
            {isOwn && (
              <div className="mt-4">
                <EditProfile wallet={wallet} user={user} />
              </div>
            )}
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-px bg-line border border-line mt-6">
          <Stat className="bg-card p-4" label="Lines" value={challenges.length} />
          <Stat className="bg-card p-4" label="Posts" value={posts.length} />
          <Stat
            className="bg-card p-4"
            label="Total Pool"
            value={
              <>
                {formatSol(totalPool)} <span className="text-faint text-sm">SOL</span>
              </>
            }
            tone="accent"
          />
        </div>
      </section>

      {/* --- Empty state --------------------------------------------------- */}
      {challenges.length === 0 && posts.length === 0 ? (
        <section className="py-16">
          <div className="border border-line bg-card p-10 text-center max-w-2xl mx-auto">
            <p className="display text-2xl text-ink">Nothing on the card yet</p>
            <p className="text-sm text-muted mt-2">This athlete hasn&rsquo;t posted yet.</p>
          </div>
        </section>
      ) : (
        <>
          {/* --- Lines ----------------------------------------------------- */}
          {challenges.length > 0 && (
            <section className="py-7">
              <LineGroup title="Open Lines" challenges={active} side="open" />
              {settled.length > 0 && (
                <div className="mt-10">
                  <LineGroup title="Settled" challenges={settled} side="settled" />
                </div>
              )}
            </section>
          )}

          {/* --- Posts grid ------------------------------------------------ */}
          {posts.length > 0 && (
            <section className="py-7 border-t border-ink">
              <div className="flex items-end justify-between border-b-2 border-ink pb-3">
                <h2 className="display text-2xl sm:text-3xl text-ink">The Grid</h2>
                <span className="label hidden sm:block">{posts.length} post{posts.length === 1 ? '' : 's'}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border border-line mt-5">
                {posts.map((post) => (
                  <PostThumb key={post.photo.id} post={post} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function LineGroup({
  title,
  challenges,
  side,
}: {
  title: string;
  challenges: Challenge[];
  side: 'open' | 'settled';
}) {
  return (
    <div>
      <div className="flex items-end justify-between rule-ink pt-3">
        <h2 className="display text-2xl text-ink mt-3">{title}</h2>
        <span className="num text-sm text-muted">{challenges.length}</span>
      </div>

      {challenges.length === 0 ? (
        <div className="border border-line bg-card p-6 mt-4">
          <p className="text-sm text-muted">
            {side === 'open' ? 'No open lines right now.' : 'No settled lines yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostThumb({ post }: { post: FeedPost }) {
  const { photo, challenge, likeCount } = post;

  return (
    <Link
      href={`/challenge/${challenge.id}`}
      className="group relative block bg-paper-2 aspect-square overflow-hidden"
    >
      {isVideo(photo) ? (
        /* eslint-disable-next-line jsx-a11y/media-has-caption */
        <video
          src={mediaSrc(photo)}
          muted
          playsInline
          preload="metadata"
          className="block w-full h-full object-cover bg-ink"
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={mediaSrc(photo)}
          alt={photo.caption || `Progress shot · ${challenge.title}`}
          className="block w-full h-full object-cover"
        />
      )}

      {/* Corner tags */}
      <div className="absolute top-0 left-0 m-1.5 flex gap-1.5">
        {photo.isFinal && (
          <Tag tone="accent" solid>
            Final
          </Tag>
        )}
        {isVideo(photo) && <Tag tone="ink" solid>Video</Tag>}
      </div>

      {/* Like overlay — appears on hover */}
      <div className="absolute inset-0 bg-ink/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <span className="num text-paper text-lg">
          {likeCount} <span className="label text-paper tracking-normal">like{likeCount === 1 ? '' : 's'}</span>
        </span>
      </div>
    </Link>
  );
}
