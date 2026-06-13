import Image from 'next/image';
import Link from 'next/link';
import { AnimatedOdds } from '@/components/AnimatedOdds';
import { Heart, MessageSquare, Flame, User } from 'lucide-react';

/* ==========================================================================
   Hardcoded demo data
   ========================================================================== */

const POSTS = [
  {
    id: 'post-3',
    user: 'Ryan',
    avatar: '💪',
    date: 'Sep 15, 2025',
    timeAgo: '3mo ago',
    image: null,
    caption:
      'Day 258. Down to 182lbs. Abs are peeking through in good lighting. Cut is ahead of schedule. YES holders eating right now.',
    likes: 412,
    comments: 67,
  },
  {
    id: 'post-2',
    user: 'Ryan',
    avatar: '💪',
    date: 'May 3, 2025',
    timeAgo: '8mo ago',
    image: null,
    caption:
      'Day 123. Weighed in at 195lbs — down 25lbs from start. Still no visible abs but the trajectory is there. NO holders getting nervous.',
    likes: 289,
    comments: 43,
  },
  {
    id: 'post-1',
    user: 'Ryan',
    avatar: '💪',
    date: 'Jan 1, 2025',
    timeAgo: '12mo ago',
    image: '/FAT.jpg',
    caption:
      'Day 1. Starting point. 220lbs, no abs in sight. Opening a line — will I have visible abs by December 31? The doubters say no chance.',
    likes: 156,
    comments: 28,
    lineOpened: true,
  },
];

/* ==========================================================================
   Components
   ========================================================================== */

function LineCard() {
  return (
    <div className="border-2 border-ink bg-card mx-4 -mt-1 mb-2 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-display uppercase text-xs tracking-wider leading-none bg-accent text-paper border-accent">
          Line opened
        </span>
        <span className="label">Closes Dec 31, 2025</span>
      </div>
      <p className="display text-lg text-ink leading-tight">
        Will his abs be visible by the end of the year?
      </p>
      <div className="mt-3">
        <AnimatedOdds baseYes={0.35} drift={0.004} height={10} />
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-line">
        <span className="num text-sm text-muted">3.2 SOL staked</span>
        <Link
          href="/lines"
          className="inline-flex items-center h-8 px-3 bg-ink text-paper border border-ink font-display uppercase tracking-wide text-sm hover:bg-accent hover:border-accent transition-colors"
        >
          View line →
        </Link>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: (typeof POSTS)[number] }) {
  return (
    <article className="bg-card border border-line hover:border-ink transition-all duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 bg-paper-2 border border-ink flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-ink" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-sm text-ink font-bold tracking-wide">
            {post.user}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-widest">{post.date}</div>
        </div>
        <span className="label shrink-0">{post.timeAgo}</span>
      </div>

      {/* Image */}
      {post.image && (
        <div className="relative w-[70%] mx-auto aspect-[4/5] bg-paper-2 border border-line">
          <Image
            src={post.image}
            alt={post.caption}
            fill
            className="object-cover"
            sizes="(max-width: 540px) 100vw, 540px"
            priority
          />
        </div>
      )}

      {/* Embedded line card */}
      {'lineOpened' in post && post.lineOpened && (
        <div className="pt-3">
          <LineCard />
        </div>
      )}

      {/* Engagement */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-line text-sm mt-2">
        <span className="flex items-center gap-1.5 num text-ink font-semibold">
          <Heart className="w-4 h-4 text-accent fill-accent" /> {post.likes.toLocaleString()}
        </span>
        <span className="flex items-center gap-1.5 num text-muted">
          <MessageSquare className="w-4 h-4" /> {post.comments}
        </span>
      </div>

      {/* Caption */}
      <div className="px-4 pb-3">
        <p className="text-sm text-ink-2 leading-relaxed">
          <span className="font-semibold text-ink mr-1">{post.user}</span>
          {post.caption}
        </p>
      </div>
    </article>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function FeedPage() {
  return (
    <div className="max-w-[520px] mx-auto px-3 py-6">
      {/* Feed */}
      <div className="space-y-4">
        {POSTS.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
