'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import type { Comment } from '@/types/contract';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { shortWallet, formatDate } from '@/lib/format';

interface Props {
  challengeId: string;
  comments: Comment[];
}

function relativeDate(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/** Instagram-style comments on a line. */
export function LineComments({ challengeId, comments }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const wallet = publicKey?.toBase58();

  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    const trimmed = body.trim();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    try {
      await api.createComment({ challengeId, wallet, type: 'comment', body: trimmed });
      await queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="display text-xl text-ink">Comments</h3>
        <span className="num text-sm text-muted">{ordered.length}</span>
      </div>

      <div className="rule mt-3 pt-4">
        {wallet ? (
          <form onSubmit={onSubmit} className="flex items-center gap-3">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              maxLength={280}
              disabled={busy}
              className="flex-1 h-10 px-3 bg-card border border-line text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
            <Button type="submit" variant="accent" size="sm" disabled={busy || body.trim() === ''}>
              {busy ? 'Posting…' : 'Post'}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-ink-2">Connect a wallet to comment.</p>
            <WalletMultiButton />
          </div>
        )}
        {error && <p className="text-xs text-no mt-2">{error}</p>}
      </div>

      <div className="mt-4">
        {ordered.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No comments yet — start the conversation.</p>
        ) : (
          <ul>
            {ordered.map((c) => (
              <li key={c.id} className="rule py-3 first:rule-ink first:pt-3">
                <div className="flex items-center gap-2">
                  <Link href={`/u/${c.wallet}`} className="num text-sm text-ink hover:text-accent">
                    {shortWallet(c.wallet)}
                  </Link>
                  <span className="label tracking-normal ml-auto">{relativeDate(c.createdAt)}</span>
                </div>
                {c.body && <p className="text-sm text-ink-2 mt-1.5 break-words">{c.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
