'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChallengeDetail, BetSide } from '@/types/contract';
import { api } from '@/lib/api';
import { formatSol } from '@/lib/format';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';

function SettleRow({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'ink' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-2">{label}</span>
      <span className={`num ${tone === 'accent' ? 'text-accent' : 'text-ink'}`}>{value} SOL</span>
    </div>
  );
}

interface Props {
  challenge: ChallengeDetail;
}

/**
 * Resolution pipeline UI: shows the AI Trusted Oracle verdict and the controls
 * for the dispute window / settlement. Only rendered once a line is in
 * under_review / disputed / resolved / refunded.
 */
export function ResolutionPanel({ challenge }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const wallet = publicKey?.toBase58();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { status, verdict, proposedOutcome, disputeWindowEndsAt } = challenge;
  const inWindow = disputeWindowEndsAt ? Date.now() < new Date(disputeWindowEndsAt).getTime() : false;

  if (status !== 'under_review' && status !== 'disputed' && status !== 'resolved' && status !== 'refunded') {
    return null;
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const settle = (outcome: BetSide) => run(`settle-${outcome}`, () => api.resolveChallenge(challenge.id, { manualOutcome: outcome }));
  const dispute = () => run('dispute', () => api.disputeLine(challenge.id, wallet!));

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="display text-xl text-ink">Resolution</h3>
        {status === 'under_review' && <Tag tone="ink" solid>Under review</Tag>}
        {status === 'disputed' && <Tag tone="accent" solid>Disputed</Tag>}
        {status === 'resolved' && (
          <Tag tone={challenge.outcome === 'yes' ? 'yes' : 'no'} solid>Settled {challenge.outcome}</Tag>
        )}
        {status === 'refunded' && <Tag tone="muted" solid>Refunded</Tag>}
      </div>
      <div className="rule-ink mt-2 pt-3" />

      {status === 'refunded' ? (
        <p className="text-sm text-ink-2">This line was refunded — every stake was returned.</p>
      ) : (
        <>
          {/* Verdict card */}
          {verdict ? (
            <div className="border border-line bg-paper-2 p-3">
              <div className="flex items-center justify-between">
                <span className="label text-ink">AI Trusted Oracle</span>
                <span className="num text-sm text-muted">{Math.round((verdict.confidence ?? 0) * 100)}% conf.</span>
              </div>
              <p className="text-sm text-ink mt-1.5">
                Leaning{' '}
                <span className={`font-semibold ${proposedOutcome === 'yes' ? 'text-yes' : proposedOutcome === 'no' ? 'text-no' : 'text-accent'}`}>
                  {proposedOutcome ? proposedOutcome.toUpperCase() : 'MANUAL REVIEW'}
                </span>
              </p>
              <p className="text-sm text-ink-2 mt-1.5">{verdict.reasoning}</p>
              {verdict.observedEvidence?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {verdict.observedEvidence.map((e, i) => (
                    <li key={i} className="text-xs text-muted flex gap-1.5">
                      <span className="text-faint">·</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Awaiting the oracle verdict…</p>
          )}

          {/* Settlement breakdown (resolved) */}
          {status === 'resolved' && challenge.settlement && (
            <div className="border border-line bg-paper-2 p-3 mt-3">
              <span className="label text-ink">Settlement</span>
              {challenge.settlement.refunded ? (
                <p className="text-sm text-ink-2 mt-1.5">One-sided market — all stakes refunded, no fees taken.</p>
              ) : (
                <div className="mt-2 space-y-1.5 text-sm">
                  <SettleRow label="Total pool" value={formatSol(challenge.settlement.totalPoolLamports)} />
                  <SettleRow label="Influencer cut" value={formatSol(challenge.settlement.creatorPayoutLamports)} tone="accent" />
                  <SettleRow label="Platform fee" value={formatSol(challenge.settlement.platformPayoutLamports)} />
                  <SettleRow
                    label="To winners"
                    value={formatSol(challenge.settlement.winningPoolLamports + challenge.settlement.distributableLamports)}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="border border-no bg-no-soft px-3 py-2 mt-3">
              <span className="label text-no">{error}</span>
            </div>
          )}

          {/* Actions */}
          {status === 'under_review' && (
            <div className="mt-3 space-y-3">
              {inWindow && (
                <p className="text-xs text-faint">
                  Dispute window open until {new Date(disputeWindowEndsAt!).toLocaleString()}. It auto-settles after.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {proposedOutcome ? (
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={() => settle(proposedOutcome as BetSide)}
                    disabled={busy !== null}
                  >
                    {busy?.startsWith('settle') ? 'Settling…' : `Settle ${proposedOutcome.toUpperCase()}`}
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="yes" size="sm" onClick={() => settle('yes')} disabled={busy !== null}>
                      Force YES
                    </Button>
                    <Button type="button" variant="no" size="sm" onClick={() => settle('no')} disabled={busy !== null}>
                      Force NO
                    </Button>
                  </>
                )}
                {wallet && inWindow && (
                  <Button type="button" variant="outline" size="sm" onClick={dispute} disabled={busy !== null}>
                    {busy === 'dispute' ? 'Disputing…' : 'Dispute'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {status === 'disputed' && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-ink-2">The verdict was contested — an admin must resolve it manually.</p>
              <div className="flex items-center gap-3">
                <Button type="button" variant="yes" size="sm" onClick={() => settle('yes')} disabled={busy !== null}>
                  Resolve YES
                </Button>
                <Button type="button" variant="no" size="sm" onClick={() => settle('no')} disabled={busy !== null}>
                  Resolve NO
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
