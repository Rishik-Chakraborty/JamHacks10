/**
 * CommentsPanel — lists challenge comments/reactions and a form to add one.
 * Each entry carries a reaction `type` (comment/fire/skull/muscle) + optional
 * body. Posting requires a connected wallet.
 */
'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { MessageCircle, Flame, Skull, Dumbbell, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import type { Comment, ReactionType, CreateCommentBody } from '@/types/contract';

export interface CommentsPanelProps {
  challengeId: string;
  comments: Comment[];
  className?: string;
}

const REACTIONS: { type: ReactionType; icon: typeof Flame; label: string }[] = [
  { type: 'comment', icon: MessageCircle, label: 'Comment' },
  { type: 'fire', icon: Flame, label: 'Fire' },
  { type: 'skull', icon: Skull, label: 'Skull' },
  { type: 'muscle', icon: Dumbbell, label: 'Muscle' },
];

const ICON: Record<ReactionType, typeof Flame> = {
  comment: MessageCircle,
  fire: Flame,
  skull: Skull,
  muscle: Dumbbell,
};

function shortWallet(w: string): string {
  return w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export function CommentsPanel({ challengeId, comments, className = '' }: CommentsPanelProps) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  const [type, setType] = useState<ReactionType>('comment');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CreateCommentBody) => api.createComment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['comments', challengeId] });
      setBody('');
      setType('comment');
      setError(null);
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Failed to post comment'),
  });

  const submit = useCallback(() => {
    if (!publicKey) {
      setError('Connect a wallet to comment');
      return;
    }
    if (type === 'comment' && body.trim() === '') {
      setError('Write something or pick a reaction');
      return;
    }
    mutation.mutate({
      challengeId,
      wallet: publicKey.toBase58(),
      type,
      body: body.trim() === '' ? undefined : body.trim(),
    });
  }, [publicKey, type, body, challengeId, mutation]);

  const ordered = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Card className={`flex flex-col gap-4 p-4 ${className}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 text-brand" />
        Comments &amp; reactions
        <span className="text-muted">({comments.length})</span>
      </h3>

      {/* Composer */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map(({ type: rt, icon: Icon, label }) => (
            <button
              key={rt}
              type="button"
              onClick={() => setType(rt)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                type === rt
                  ? 'border-brand bg-brand/15 text-brand'
                  : 'border-border text-muted hover:bg-surface-2'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={publicKey ? 'Say something…' : 'Connect a wallet to comment'}
            disabled={!publicKey || mutation.isPending}
            rows={2}
            className="min-h-10 flex-1 resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand disabled:opacity-60"
          />
          <Button
            variant="brand"
            onClick={submit}
            disabled={!publicKey || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {error && <p className="text-xs text-no">{error}</p>}
      </div>

      {/* List */}
      <ul className="flex flex-col gap-3">
        {ordered.length === 0 && (
          <li className="text-sm text-muted">No comments yet — be the first.</li>
        )}
        {ordered.map((c) => {
          const Icon = ICON[c.type];
          return (
            <li key={c.id} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-mono text-foreground">{shortWallet(c.wallet)}</span>
                  <span>{fmt(c.createdAt)}</span>
                </div>
                {c.body && <p className="text-sm text-foreground">{c.body}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
