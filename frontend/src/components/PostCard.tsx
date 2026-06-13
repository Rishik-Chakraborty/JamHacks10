'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Share2, Swords } from 'lucide-react';
import type { FeedPost } from '@/types/contract';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { OddsBar } from '@/components/ui/OddsBar';
import { formatDate, shortWallet } from '@/lib/format';
import { mediaSrc, isVideo } from '@/lib/media';

/** Two uppercase initials for the avatar fallback. */
function initials(handle: string): string {
  return handle.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
}

export function PostCard({ post }: { post: FeedPost }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const queryClient = useQueryClient();

  const { photo, challenge, creator } = post;
  const authorWallet = photo.authorWallet ?? challenge?.creatorWallet ?? '';
  const handle = creator?.username || shortWallet(authorWallet);
  const isOwn = wallet === authorWallet;

  // --- Like (optimistic) ----------------------------------------------------
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  async function onLike() {
    if (!wallet || likeBusy) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    setLikeBusy(true);
    try {
      const res = await api.toggleLike(photo.id, wallet);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      setLiked(liked);
      setLikeCount(post.likeCount);
    } finally {
      setLikeBusy(false);
    }
  }

  async function onShare() {
    const url = challenge
      ? `${location.origin}/challenge/${challenge.id}`
      : `${location.origin}/u/${authorWallet}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: challenge?.title ?? handle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareHint('Link copied');
      setTimeout(() => setShareHint(null), 2000);
    } catch {
      /* dismissed / unavailable */
    }
  }

  const caption = photo.caption ?? null;

  return (
    <Panel className="flex flex-col">
      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/u/${authorWallet}`} className="shrink-0">
          {creator?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatar} alt={handle} className="block h-9 w-9 object-cover border border-ink" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center bg-ink text-paper font-display text-sm leading-none">
              {initials(handle)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${authorWallet}`} className="display-tight text-base text-ink hover:text-accent transition-colors block truncate">
            {handle}
          </Link>
          <span className="label tracking-normal text-faint">{formatDate(photo.capturedAt)}</span>
        </div>
        {!isOwn && authorWallet && (
          <Link href={`/create?influencer=${authorWallet}`} className="shrink-0">
            <Tag tone="accent" solid>Challenge</Tag>
          </Link>
        )}
      </div>

      {/* MEDIA */}
      <div className="relative bg-paper-2 border-y border-ink">
        {isVideo(photo) ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={mediaSrc(photo)} controls playsInline preload="metadata" className="block w-full aspect-square object-cover bg-ink" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(photo)} alt={caption ?? `Post by ${handle}`} className="block w-full aspect-square object-cover" />
        )}
        <div className="absolute top-0 left-0 m-2 flex gap-1.5">
          {photo.isFinal && <Tag tone="accent" solid>Final proof</Tag>}
          {isVideo(photo) && <Tag tone="ink" solid>Video</Tag>}
        </div>
      </div>

      {/* ACTIONS */}
      <div className="px-4 py-2.5 rule flex items-center gap-5">
        <button
          type="button"
          onClick={onLike}
          disabled={likeBusy}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${liked ? 'text-accent' : 'text-ink hover:text-accent'}`}
        >
          <Heart className="h-5 w-5" strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
          <span className="num text-sm">{likeCount}</span>
        </button>

        {challenge && (
          <Link href={`/challenge/${challenge.id}`} className="inline-flex items-center gap-1.5 text-ink hover:text-accent transition-colors">
            <MessageCircle className="h-5 w-5" strokeWidth={2} />
            <span className="num text-sm">{post.commentCount}</span>
          </Link>
        )}

        <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 text-ink hover:text-accent transition-colors ml-auto">
          <Share2 className="h-5 w-5" strokeWidth={2} />
          <span className="label tracking-normal text-current">{shareHint ?? 'Share'}</span>
        </button>
      </div>

      {/* CAPTION */}
      {caption && (
        <p className="px-4 pt-3 text-sm text-ink-2 leading-snug">
          <span className="display-tight text-ink mr-1.5">{handle}</span>
          {caption}
        </p>
      )}

      {/* ATTACHED LINE — pops up below the post */}
      {challenge ? (
        <div className="m-4 border border-ink bg-paper-2">
          <div className="px-3 py-2.5 flex items-center gap-3">
            <Swords className="h-4 w-4 text-accent shrink-0" strokeWidth={2} />
            <Link href={`/challenge/${challenge.id}`} className="display-tight text-base text-ink hover:text-accent transition-colors leading-tight min-w-0 flex-1 truncate">
              {challenge.title}
            </Link>
            {challenge.status === 'resolved' ? (
              <Tag tone={challenge.outcome === 'yes' ? 'yes' : 'no'} solid>Settled {challenge.outcome}</Tag>
            ) : challenge.status === 'active' ? (
              <span className="label text-ink">Open</span>
            ) : (
              <Tag tone="muted">{challenge.status.replace('_', ' ')}</Tag>
            )}
          </div>
          <div className="px-3 pb-3">
            <OddsBar impliedYes={challenge.impliedYes} labeled height={8} />
            <Link href={`/challenge/${challenge.id}`} className="block mt-3">
              <Button variant="accent" size="md" className="w-full">Back this line →</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-1" />
      )}
    </Panel>
  );
}
