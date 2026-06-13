'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, Share2 } from 'lucide-react';
import type { ChallengeDetail } from '@/types/contract';
import { api } from '@/lib/api';

interface Props {
  challenge: ChallengeDetail;
}

/** Like + share row for a line. */
export function LineSocial({ challenge }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const wallet = publicKey?.toBase58();

  const [liked, setLiked] = useState(challenge.likedByMe ?? false);
  const [count, setCount] = useState(challenge.likeCount ?? 0);
  const [busy, setBusy] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  async function onLike() {
    if (!wallet || busy) return;
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    setBusy(true);
    try {
      const res = await api.likeLine(challenge.id, wallet);
      setLiked(res.likedByMe ?? next);
      setCount(res.likeCount ?? count);
      void queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
    } catch {
      setLiked(!next);
      setCount(challenge.likeCount ?? 0);
    } finally {
      setBusy(false);
    }
  }

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
      /* dismissed / unavailable */
    }
  }

  return (
    <div className="flex items-center gap-5 mt-4">
      <button
        type="button"
        onClick={onLike}
        disabled={!wallet || busy}
        aria-pressed={liked}
        className={`inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${liked ? 'text-accent' : 'text-ink hover:text-accent'}`}
        title={wallet ? 'Like this line' : 'Connect to like'}
      >
        <Heart className="h-5 w-5" strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
        <span className="num text-sm">{count}</span>
      </button>

      <button
        type="button"
        onClick={onShare}
        className="inline-flex items-center gap-1.5 text-ink hover:text-accent transition-colors"
      >
        <Share2 className="h-5 w-5" strokeWidth={2} />
        <span className="label tracking-normal text-current">{shareHint ?? 'Share'}</span>
      </button>
    </div>
  );
}
