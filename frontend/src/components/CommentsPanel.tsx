'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import type { Comment, ReactionType } from '@/types/contract';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { shortWallet, formatDate } from '@/lib/format';

interface Props {
  challengeId: string;
  comments: Comment[];
}

const REACTIONS: { value: ReactionType; label: string }[] = [
  { value: 'comment', label: 'Comment' },
  { value: 'fire', label: 'Fire' },
  { value: 'skull', label: 'Skull' },
  { value: 'muscle', label: 'Muscle' },
];

const REACTION_LABEL: Record<ReactionType, string> = {
  comment: 'Comment',
  fire: 'Fire',
  skull: 'Skull',
  muscle: 'Muscle',
};

const REACTION_TONE: Record<ReactionType, 'muted' | 'accent' | 'ink' | 'yes'> = {
  comment: 'muted',
  fire: 'accent',
  skull: 'ink',
  muscle: 'yes',
};

/** Relative-ish timestamp, e.g. "2h ago", falling back to a date. */
function relativeDate(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function CommentsPanel({ challengeId, comments }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const wallet = publicKey?.toBase58();

  const [type, setType] = useState<ReactionType>('comment');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ordered = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    const trimmed = body.trim();
    if (type === 'comment' && trimmed === '') {
      setErrorMsg('Say something first.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await api.createComment({
        challengeId,
        wallet,
        type,
        body: trimmed === '' ? undefined : trimmed,
      });
      await queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      setBody('');
      setType('comment');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not post that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="display text-xl text-ink">Trash Talk</h3>
        <span className="num text-sm text-muted">{ordered.length}</span>
      </div>

      {/* Composer */}
      <div className="rule mt-3 pt-4">
        {wallet ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="block sm:w-36 shrink-0">
                <span className="label">Reaction</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ReactionType)}
                  disabled={busy}
                  className="mt-1.5 w-full h-10 px-2 bg-card border border-line text-ink font-display uppercase tracking-wide text-sm focus:border-ink focus:outline-none"
                >
                  {REACTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block flex-1">
                <span className="label">Message</span>
                <input
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={type === 'comment' ? 'Talk your talk…' : 'optional'}
                  disabled={busy}
                  maxLength={280}
                  className="mt-1.5 w-full h-10 px-3 bg-card border border-line text-ink placeholder:text-faint focus:border-ink focus:outline-none"
                />
              </label>
            </div>

            {errorMsg && (
              <div className="border border-no bg-no-soft px-3 py-2">
                <span className="label text-no">{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="label tracking-normal">As {shortWallet(wallet)}</span>
              <Button type="submit" variant="accent" size="sm" disabled={busy}>
                {busy ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-ink-2">Connect a wallet to join the talk.</p>
            <WalletMultiButton />
          </div>
        )}
      </div>

      {/* List */}
      <div className="mt-4">
        {ordered.length === 0 ? (
          <div className="border border-line bg-paper-2 p-6 text-center">
            <p className="display text-lg text-ink">Silence on the board</p>
            <p className="text-xs text-muted mt-1">Be the first to weigh in.</p>
          </div>
        ) : (
          <ul>
            {ordered.map((c) => (
              <li key={c.id} className="rule py-3 first:rule-ink first:pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="num text-sm text-ink">{shortWallet(c.wallet)}</span>
                  <Tag tone={REACTION_TONE[c.type]}>{REACTION_LABEL[c.type]}</Tag>
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
