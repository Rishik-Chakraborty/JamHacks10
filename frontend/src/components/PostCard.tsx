'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import type { FeedPost, ReactionType } from '@/types/contract';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { OddsBar } from '@/components/ui/OddsBar';
import { formatDate, shortWallet } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/** Resolve a photo's image source: inline data URL, else the GridFS endpoint. */
function photoSrc(post: FeedPost): string {
  if (post.photo.imageData) return post.photo.imageData;
  return `${API}/photos/${post.photo.id}/image`;
}

/** First two characters of a wallet, uppercased — avatar fallback initials. */
function initials(wallet: string): string {
  return wallet.slice(0, 2).toUpperCase();
}

const REACTIONS: { value: ReactionType; label: string }[] = [
  { value: 'comment', label: 'Comment' },
  { value: 'fire', label: 'Hype' },
  { value: 'skull', label: 'Doubt' },
  { value: 'muscle', label: 'Respect' },
];

export function PostCard({ post }: { post: FeedPost }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const queryClient = useQueryClient();

  const { photo, challenge, creator } = post;

  // --- Like (optimistic local state) ---------------------------------------
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeHint, setLikeHint] = useState<string | null>(null);

  async function onLike() {
    if (!wallet) {
      setLikeHint('Connect to like');
      return;
    }
    if (likeBusy) return;
    // Optimistic flip.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));
    setLikeBusy(true);
    try {
      const res = await api.toggleLike(photo.id, wallet);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      // Roll back on failure.
      setLiked(liked);
      setLikeCount(post.likeCount);
    } finally {
      setLikeBusy(false);
    }
  }

  // --- Comment composer -----------------------------------------------------
  const [open, setOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [body, setBody] = useState('');
  const [reaction, setReaction] = useState<ReactionType>('comment');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentErr, setCommentErr] = useState<string | null>(null);

  async function onComment(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet || commentBusy) return;
    const trimmed = body.trim();
    if (reaction === 'comment' && trimmed === '') return;
    setCommentBusy(true);
    setCommentErr(null);
    try {
      await api.createComment({
        challengeId: challenge.id,
        wallet,
        type: reaction,
        body: trimmed === '' ? undefined : trimmed,
      });
      setCommentCount((c) => c + 1);
      setBody('');
      setReaction('comment');
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
    } catch (err) {
      setCommentErr(err instanceof Error ? err.message : 'Could not post that.');
    } finally {
      setCommentBusy(false);
    }
  }

  // --- Share ----------------------------------------------------------------
  const [shareHint, setShareHint] = useState<string | null>(null);

  async function onShare() {
    const url = `${location.origin}/challenge/${challenge.id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: challenge.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareHint('Link copied');
      setTimeout(() => setShareHint(null), 2000);
    } catch {
      // User dismissed the share sheet, or clipboard unavailable — stay calm.
    }
  }

  const handle = creator?.username || shortWallet(challenge.creatorWallet);
  const caption =
    photo.caption ??
    (photo.metricValue !== undefined ? `Logged ${photo.metricValue}.` : null);

  return (
    <Panel className="flex flex-col">
      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/u/${challenge.creatorWallet}`} className="shrink-0">
          {creator?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.avatar}
              alt={handle}
              className="block h-9 w-9 object-cover border border-ink"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center bg-ink text-paper font-display text-sm leading-none">
              {initials(challenge.creatorWallet)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${challenge.creatorWallet}`}
            className="display-tight text-base text-ink hover:text-accent transition-colors block truncate"
          >
            {handle}
          </Link>
          <span className="label tracking-normal text-faint">{formatDate(photo.capturedAt)}</span>
        </div>
        <Link href={`/challenge/${challenge.id}`} className="shrink-0">
          <Tag tone="accent">Bet</Tag>
        </Link>
      </div>

      {/* PHOTO */}
      <div className="relative bg-paper-2 border-y border-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc(post)}
          alt={photo.caption ?? `Progress shot from ${formatDate(photo.capturedAt)}`}
          className="block w-full aspect-square object-cover"
        />
        {photo.isFinal && (
          <div className="absolute top-0 left-0 m-2">
            <Tag tone="accent" solid>
              Final proof
            </Tag>
          </div>
        )}
      </div>

      {/* MARKET STRIP */}
      <div className="px-4 py-3 rule flex items-center gap-3">
        <Link
          href={`/challenge/${challenge.id}`}
          className="display-tight text-base text-ink hover:text-accent transition-colors leading-tight min-w-0 flex-1 truncate"
        >
          {challenge.title}
        </Link>
        <div className="w-28 shrink-0">
          <OddsBar impliedYes={challenge.impliedYes} labeled={false} height={6} />
        </div>
      </div>

      {/* ACTIONS */}
      <div className="px-4 py-2.5 rule flex items-center gap-5">
        <button
          type="button"
          onClick={onLike}
          disabled={likeBusy}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
            liked ? 'text-accent' : 'text-ink hover:text-accent'
          }`}
        >
          <Heart className="h-5 w-5" strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
          <span className="num text-sm">{likeCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 transition-colors ${
            open ? 'text-accent' : 'text-ink hover:text-accent'
          }`}
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
          <span className="num text-sm">{commentCount}</span>
        </button>

        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-1.5 text-ink hover:text-accent transition-colors ml-auto"
        >
          <Share2 className="h-5 w-5" strokeWidth={2} />
          <span className="label tracking-normal text-current">{shareHint ?? 'Share'}</span>
        </button>
      </div>

      {/* like prompt for disconnected viewers */}
      {likeHint && (
        <p className="px-4 -mt-1 pb-1 text-xs text-faint">{likeHint} — your wallet is your account.</p>
      )}

      {/* COMMENT COMPOSER */}
      {open && (
        <form onSubmit={onComment} className="px-4 py-3 rule flex flex-col gap-3">
          {wallet ? (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Say something on this line…"
                rows={2}
                maxLength={280}
                disabled={commentBusy}
                className="w-full bg-card border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none resize-none"
              />
              <div className="flex items-center gap-3">
                <label className="label tracking-normal text-muted">
                  React
                  <select
                    value={reaction}
                    onChange={(e) => setReaction(e.target.value as ReactionType)}
                    disabled={commentBusy}
                    className="num ml-2 h-8 bg-card border border-line px-2 text-sm text-ink focus:border-ink focus:outline-none"
                  >
                    {REACTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="solid" size="sm" disabled={commentBusy} className="ml-auto">
                  {commentBusy ? 'Posting…' : 'Post'}
                </Button>
              </div>
              {commentErr && <p className="text-xs text-no">{commentErr}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">Connect your wallet to join the thread.</p>
          )}
          <Link
            href={`/challenge/${challenge.id}`}
            className="label tracking-normal underline hover:text-accent self-start"
          >
            View thread
          </Link>
        </form>
      )}

      {/* CAPTION */}
      {caption && (
        <p className="px-4 pt-3 text-sm text-ink-2 leading-snug">
          <span className="display-tight text-ink mr-1.5">{handle}</span>
          {caption}
        </p>
      )}

      {/* BET ENTRY */}
      <div className="px-4 py-4">
        <Link href={`/challenge/${challenge.id}`} className="block">
          <Button variant="accent" size="md" className="w-full">
            Back this line →
          </Button>
        </Link>
      </div>
    </Panel>
  );
}
