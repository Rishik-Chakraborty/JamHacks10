'use client';

import type { ChallengeDetail } from '@/types/contract';
import { formatSol } from '@/lib/format';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';

function SettleRow({ label, value, tone }: { label: string; value: string; tone?: 'accent' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-2">{label}</span>
      <span className={`num ${tone === 'accent' ? 'text-accent' : 'text-ink'}`}>{value} SOL</span>
    </div>
  );
}

/**
 * Animated "the oracle is judging" state. Shows while the final proof has been
 * submitted but no verdict has landed yet — Gemini and GPT-4o are racing in
 * parallel (first valid response wins; 5s hard cap → fallback). An indeterminate
 * scan bar per model conveys "loading" without faking real progress.
 */
function OracleAnalyzing() {
  return (
    <div className="oracle-sweep border border-ink bg-paper-2 p-3">
      <div className="flex items-center justify-between">
        <span className="label text-ink inline-flex items-center gap-2">
          <span className="live-tick" />
          AI Trusted Oracle
        </span>
        <span className="num text-xs text-muted">analyzing proof…</span>
      </div>
      <div className="mt-3 space-y-2.5">
        {['Gemini 2.5 Flash', 'GPT-4o vision'].map((model) => (
          <div key={model}>
            <div className="flex items-center justify-between">
              <span className="num text-xs text-ink-2">{model}</span>
              <span className="num text-[0.65rem] text-faint">racing</span>
            </div>
            <div className="oracle-bar relative mt-1 h-1.5 overflow-hidden bg-line">
              <span />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-3">
        Fastest valid verdict wins — settling the moment a model responds.
      </p>
    </div>
  );
}

/**
 * Resolution UI: shows the AI Trusted Oracle verdict + settlement. A verdict
 * settles automatically (immediately on the oracle's call, or at the deadline for
 * a deferred line) — there is no manual settle path. While a final proof is in but
 * no verdict has landed, an animated "analyzing" state shows the models racing.
 */
export function ResolutionPanel({ challenge }: { challenge: ChallengeDetail }) {
  const { status, verdict, proposedOutcome, settlement } = challenge;

  // "Judging" window: a final proof exists and we're not yet settled/refunded and
  // no verdict has come back. Covers the brief `active`→`under_review` gap right
  // after the creator submits the final photo, before the oracle responds.
  const hasFinalProof = challenge.photos?.some((p) => p.isFinal) ?? false;
  const judging =
    !verdict && status !== 'resolved' && status !== 'refunded' && (status === 'under_review' || hasFinalProof);

  if (judging) {
    return (
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="display text-xl text-ink">Resolution</h3>
          <Tag tone="ink" solid>Judging</Tag>
        </div>
        <div className="rule-ink mt-2 pt-3" />
        <OracleAnalyzing />
      </Panel>
    );
  }

  if (status !== 'under_review' && status !== 'resolved' && status !== 'refunded') return null;

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="display text-xl text-ink">Resolution</h3>
        {status === 'under_review' && <Tag tone="ink" solid>Finalizing</Tag>}
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
          {/* Verdict */}
          {verdict ? (
            <div className="border border-line bg-paper-2 p-3">
              <div className="flex items-center justify-between">
                <span className="label text-ink">AI Trusted Oracle</span>
                <span className="num text-sm text-muted">{Math.round((verdict.confidence ?? 0) * 100)}% conf.</span>
              </div>
              <p className="text-sm text-ink mt-1.5">
                Verdict{' '}
                <span className={`font-semibold ${challenge.outcome === 'yes' || proposedOutcome === 'yes' ? 'text-yes' : challenge.outcome === 'no' || proposedOutcome === 'no' ? 'text-no' : 'text-accent'}`}>
                  {challenge.outcome ? challenge.outcome.toUpperCase() : proposedOutcome ? proposedOutcome.toUpperCase() : 'YES'}
                </span>
              </p>
              <p className="text-sm text-ink-2 mt-1.5">{verdict.reasoning}</p>
              {verdict.observedEvidence?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {verdict.observedEvidence.map((e, i) => (
                    <li key={i} className="text-xs text-muted flex gap-1.5"><span className="text-faint">·</span><span>{e}</span></li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Awaiting the oracle verdict…</p>
          )}

          {/* Settlement (resolved) */}
          {status === 'resolved' && settlement && (
            <div className="border border-line bg-paper-2 p-3 mt-3">
              <span className="label text-ink">Settlement</span>
              {settlement.refunded ? (
                <p className="text-sm text-ink-2 mt-1.5">One-sided market — all stakes refunded, no fees.</p>
              ) : (
                <div className="mt-2 space-y-1.5 text-sm">
                  <SettleRow label="Total pool" value={formatSol(settlement.totalPoolLamports)} />
                  <SettleRow label="Influencer cut" value={formatSol(settlement.creatorPayoutLamports)} tone="accent" />
                  <SettleRow label="Platform fee" value={formatSol(settlement.platformPayoutLamports)} />
                  <SettleRow label="To winners" value={formatSol(settlement.winningPoolLamports + settlement.distributableLamports)} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
