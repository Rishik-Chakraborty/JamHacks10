'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import { shortWallet } from '@/lib/format';
import {
  CHALLENGE_TEMPLATES,
  type ChallengeTemplate,
  type CreateChallengeBody,
} from '@/types/contract';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';

// Wallet button is browser-only — load client-side to avoid hydration mismatch.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

const CUSTOM = 'custom' as const;

/** Substitute the single `{value}` placeholder. Falls back to a dash when empty. */
function fill(template: string, value: string): string {
  return template.replace(/\{value\}/g, value.trim() === '' ? '—' : value.trim());
}

/** Local datetime-local string -> ISO. */
function toIso(localDatetime: string): string {
  return new Date(localDatetime).toISOString();
}

/** Min for the datetime-local input: ~5 min out, formatted as local YYYY-MM-DDTHH:mm. */
function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

/** FNV-1a (32-bit) hash -> 8 hex chars. Deterministic, <=32-byte slug with 'gc' prefix. */
function slugFromId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'gc' + (h >>> 0).toString(16).padStart(8, '0');
}

export function CreateChallengeForm() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const [mode, setMode] = useState<string>(CHALLENGE_TEMPLATES[0]?.id ?? CUSTOM);
  const [value, setValue] = useState('');
  const [deadline, setDeadline] = useState('');

  // Custom-goal fields
  const [title, setTitle] = useState('');
  const [goalText, setGoalText] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [unit, setUnit] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [marketNote, setMarketNote] = useState<string | null>(null);

  const wallet = publicKey?.toBase58() ?? null;
  const isCustom = mode === CUSTOM;
  const template: ChallengeTemplate | undefined = useMemo(
    () => CHALLENGE_TEMPLATES.find((t) => t.id === mode),
    [mode],
  );

  /* ---- Wallet gate ---------------------------------------------------- */
  if (!wallet) {
    return (
      <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
        <div className="lg:col-span-8">
          <Panel className="p-8">
            <p className="label">Step One</p>
            <h2 className="display text-3xl text-ink mt-2">Connect a wallet to open a line</h2>
            <p className="text-sm text-ink-2 mt-2 max-w-md">
              Your connected wallet signs the market into existence and is recorded as the athlete on
              the card. Connect to continue.
            </p>
            <div className="mt-5">
              <WalletMultiButton />
            </div>
          </Panel>
        </div>
        <HowItWorks />
      </div>
    );
  }

  // Derived preview for template mode.
  const previewTitle = template ? fill(template.titleTemplate, value) : '';
  const previewGoal = template ? fill(template.goalTemplate, value) : '';
  const previewCriteria = template ? fill(template.criteriaTemplate, value) : '';

  function validate(): string | null {
    if (!deadline) return 'Set a deadline.';
    if (new Date(deadline).getTime() <= Date.now()) return 'The deadline must be in the future.';
    if (isCustom) {
      if (title.trim().length < 4) return 'Give it a punchy title (4+ chars).';
      if (goalText.trim().length < 10) return 'Describe the goal in a sentence (10+ chars).';
      if (successCriteria.trim().length < 10) return 'Spell out exactly how the judge decides (10+ chars).';
    } else if (template?.valuePrompt) {
      const n = Number(value);
      if (value.trim() === '' || !Number.isFinite(n) || n <= 0) {
        return `Enter a valid ${template.valuePrompt.toLowerCase()}.`;
      }
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setReviewError(null);
    setMarketNote(null);

    const problem = validate();
    if (problem) {
      setSubmitError(problem);
      return;
    }

    const body: CreateChallengeBody = isCustom
      ? {
          creatorWallet: wallet!,
          title: title.trim(),
          goalText: goalText.trim(),
          successCriteria: successCriteria.trim(),
          metricUnit: unit.trim() === '' ? undefined : unit.trim(),
          deadline: toIso(deadline),
        }
      : {
          creatorWallet: wallet!,
          title: previewTitle,
          goalText: previewGoal,
          successCriteria: previewCriteria,
          metricUnit: template?.unit,
          templateId: template!.id,
          deadline: toIso(deadline),
        };

    setSubmitting(true);
    try {
      let challenge;
      try {
        challenge = await api.createChallenge(body);
      } catch (err) {
        // A custom goal can be rejected by the AI reviewer (HTTP 422) — surface
        // its feedback distinctly so the user knows what to fix.
        if (isCustom) {
          setReviewError(err instanceof Error ? err.message : 'This goal wasn’t accepted — make it more specific and checkable.');
          setSubmitting(false);
          return;
        }
        throw err;
      }

      // Best-effort: register the creator as a user. Never blocks the flow.
      await api.createUser({ wallet: wallet!, username: shortWallet(wallet!) }).catch(() => {});

      // On-chain market init — degrade gracefully if not deployed/connected.
      const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
      const authority = process.env.NEXT_PUBLIC_ORACLE_AUTHORITY;
      if (programId && authority && anchorWallet) {
        try {
          const { initializeMarket } = await import('@/lib/market');
          const slug = slugFromId(challenge.id);
          const { marketPda, vaultPda } = await initializeMarket({
            connection,
            wallet: anchorWallet,
            slug,
            deadline: body.deadline,
            authority,
          });
          await api.attachMarket(challenge.id, { marketPda, vaultPda, programId });
        } catch {
          setMarketNote('market step skipped — betting opens once deployed');
        }
      } else {
        setMarketNote('market step skipped — betting opens once deployed');
      }

      router.push(`/challenge/${challenge.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not open the line. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
      <form className="lg:col-span-8" onSubmit={onSubmit} noValidate>
        <Panel className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="label">The Terms</p>
            <Tag tone="muted">Athlete · {shortWallet(wallet)}</Tag>
          </div>

          {/* Goal type dropdown */}
          <div className="mt-6">
            <label htmlFor="goalType" className="label block">
              Goal
            </label>
            <p className="text-xs text-faint mt-0.5">
              Pick a ready-made, judge-verifiable goal — or write your own.
            </p>
            <select
              id="goalType"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setSubmitError(null);
                setReviewError(null);
              }}
              disabled={submitting}
              className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink font-display uppercase tracking-wide text-sm"
            >
              <option value={CUSTOM}>✦ Write your own goal</option>
              <optgroup label="Pre-made goals">
                {CHALLENGE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* ---- Template mode -------------------------------------------- */}
          {!isCustom && template && (
            <div className="mt-5 space-y-5">
              {template.valuePrompt && (
                <div>
                  <label htmlFor="value" className="label block">
                    {template.valuePrompt}
                  </label>
                  <input
                    id="value"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. 140"
                    className="num w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
                  />
                </div>
              )}

              {/* Auto-built preview */}
              <div className="rule-ink pt-4">
                <p className="label text-ink">Preview</p>
                <h3 className="display text-2xl text-ink mt-1.5">{previewTitle}</h3>
                <p className="text-sm text-ink-2 mt-1.5">{previewGoal}</p>
                <div className="border border-ink bg-paper-2 p-3 mt-3">
                  <div className="label text-ink">Winning condition (the AI judge reads this)</div>
                  <p className="text-sm text-ink-2 mt-1.5">{previewCriteria}</p>
                </div>
                <p className="text-xs text-faint mt-2">
                  Pre-made goals are pre-approved — no review needed.
                </p>
              </div>
            </div>
          )}

          {/* ---- Custom mode ---------------------------------------------- */}
          {isCustom && (
            <div className="mt-5 space-y-5">
              <div className="border border-accent bg-card px-3 py-2">
                <span className="label text-accent">Custom goal</span>
                <p className="text-xs text-ink-2 mt-0.5">
                  Make it specific and checkable from a photo or video. Vague or subjective goals get
                  sent back with notes on what to fix.
                </p>
              </div>

              <div>
                <label htmlFor="title" className="label block">Title</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Drop to sub-12% body fat by August"
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
                />
              </div>

              <div>
                <label htmlFor="goalText" className="label block">The Goal</label>
                <p className="text-xs text-faint mt-0.5">Plain-language pitch shown on the card.</p>
                <textarea
                  id="goalText"
                  rows={3}
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="Cut to single-digit body fat in eight weeks, training six days a week."
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 py-2 mt-1.5 text-ink placeholder:text-faint resize-y"
                />
              </div>

              <div className="rule-ink pt-4">
                <label htmlFor="successCriteria" className="label block text-ink">Success Criteria</label>
                <p className="text-xs text-accent mt-0.5 font-semibold">
                  Be precise and checkable from a photo/video — the judge reads THIS at the deadline.
                </p>
                <textarea
                  id="successCriteria"
                  rows={3}
                  value={successCriteria}
                  onChange={(e) => setSuccessCriteria(e.target.value)}
                  placeholder="Final photo shows a scale reading 175 lb or less with the number legible."
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 py-2 mt-1.5 text-ink placeholder:text-faint resize-y"
                />
              </div>

              <div>
                <label htmlFor="unit" className="label block">Metric unit <span className="text-faint normal-case">(optional)</span></label>
                <p className="text-xs text-faint mt-0.5">Unit for the progress chart, e.g. kg, reps, %.</p>
                <input
                  id="unit"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="kg"
                  maxLength={16}
                  className="w-40 bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
                />
              </div>
            </div>
          )}

          {/* Deadline */}
          <div className="mt-6">
            <label htmlFor="deadline" className="label block">Deadline</label>
            <input
              id="deadline"
              type="datetime-local"
              min={minDatetimeLocal()}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="num w-full sm:w-72 bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink"
            />
          </div>

          {/* Submit + states */}
          <div className="rule pt-5 mt-7">
            {reviewError ? (
              <div className="border border-no bg-no-soft px-3 py-2.5 mb-4">
                <p className="label text-no">This goal needs work</p>
                <p className="text-sm text-ink-2 mt-1">{reviewError}</p>
              </div>
            ) : null}
            {submitError ? (
              <div className="border border-no bg-no-soft px-3 py-2 mb-4">
                <p className="text-sm text-no">{submitError}</p>
              </div>
            ) : null}
            {marketNote ? (
              <div className="border border-line bg-paper-2 px-3 py-2 mb-4">
                <p className="text-xs text-muted">{marketNote}</p>
              </div>
            ) : null}
            <div className="flex items-center gap-4">
              <Button type="submit" variant="accent" size="lg" disabled={submitting}>
                {submitting
                  ? isCustom
                    ? 'Checking…'
                    : 'Opening…'
                  : isCustom
                    ? 'Submit goal'
                    : 'Open the line'}
              </Button>
              <p className="label tracking-normal">
                {submitting ? 'Signing & posting' : 'Posts to the board'}
              </p>
            </div>
          </div>
        </Panel>
      </form>

      <HowItWorks />
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Right column — "How it works" aside.
 * ----------------------------------------------------------------------- */
function HowItWorks() {
  const steps: { n: string; head: string; body: string }[] = [
    { n: '01', head: 'Pick or write a goal', body: 'Choose a ready-made goal, or write your own to put on the board.' },
    { n: '02', head: 'Sign the market', body: 'Your wallet opens a parimutuel pool keyed to this line.' },
    { n: '03', head: 'The board reacts', body: 'Spectators stake SOL on YES or NO. Odds move live.' },
    { n: '04', head: 'The bell rings', body: 'At the deadline an AI judge reads your photo/video proof. Winners split the pot.' },
  ];
  return (
    <aside className="lg:col-span-4">
      <p className="label">How it works</p>
      <div className="rule-accent pt-4 mt-2">
        <dl className="space-y-5">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-3">
              <span className="num text-muted text-sm pt-0.5">{s.n}</span>
              <div>
                <dt className="font-display uppercase tracking-wide text-ink text-sm">{s.head}</dt>
                <dd className="text-xs text-ink-2 mt-0.5 leading-relaxed">{s.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
      <div className="rule pt-3 mt-5">
        <p className="text-xs text-faint leading-relaxed">
          Amounts settle in SOL. The judge is read-only and reads your final proof against the
          success criteria — write them so a stranger could rule on them.
        </p>
      </div>
    </aside>
  );
}
