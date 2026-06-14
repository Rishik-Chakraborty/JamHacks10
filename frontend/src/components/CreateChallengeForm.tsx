'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import { shortWallet } from '@/lib/format';
import {
  CHALLENGE_TEMPLATES,
  LAMPORTS_PER_SOL,
  DEFAULT_CREATOR_FEE_BPS,
  DEFAULT_PLATFORM_FEE_BPS,
  type ChallengeTemplate,
  type CreateChallengeBody,
  type BetSide,
  type User,
} from '@/types/contract';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

const CUSTOM = 'custom' as const;

function fill(template: string, value: string): string {
  return template.replace(/\{value\}/g, value.trim() === '' ? '—' : value.trim());
}
function toIso(localDatetime: string): string {
  return new Date(localDatetime).toISOString();
}
function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function slugFromId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'gc' + (h >>> 0).toString(16).padStart(8, '0');
}
/** Loose base58 wallet check so a pasted address can be used directly. */
function looksLikeWallet(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

export function CreateChallengeForm() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  // Influencer picker
  const [infQuery, setInfQuery] = useState('');
  const [infDebounced, setInfDebounced] = useState('');
  const [influencer, setInfluencer] = useState<{ wallet: string; username: string } | null>(null);

  // Goal
  const [mode, setMode] = useState<string>(CHALLENGE_TEMPLATES[0]?.id ?? CUSTOM);
  const [value, setValue] = useState('');
  const [deadline, setDeadline] = useState('');
  const [title, setTitle] = useState('');
  const [goalText, setGoalText] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [unit, setUnit] = useState('');

  // Seed bet
  const [seedSide, setSeedSide] = useState<BetSide>('no');
  const [seedAmount, setSeedAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const wallet = publicKey?.toBase58() ?? null;
  const isCustom = mode === CUSTOM;
  const template: ChallengeTemplate | undefined = useMemo(
    () => CHALLENGE_TEMPLATES.find((t) => t.id === mode),
    [mode],
  );

  useEffect(() => {
    const id = setTimeout(() => setInfDebounced(infQuery.trim()), 250);
    return () => clearTimeout(id);
  }, [infQuery]);

  // Pre-fill the influencer from ?influencer=<wallet> (the Challenge button flow).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pre = new URLSearchParams(window.location.search).get('influencer');
    if (!pre) return;
    setInfluencer({ wallet: pre, username: shortWallet(pre) });
    api.getUser(pre).then((u) => setInfluencer({ wallet: pre, username: u.username })).catch(() => {});
  }, []);

  const { data: infResults } = useQuery<User[]>({
    queryKey: ['userSearch', infDebounced],
    queryFn: () => api.searchUsers(infDebounced),
    enabled: infDebounced.length >= 1 && !influencer,
    staleTime: 10_000,
  });

  if (!wallet) {
    return (
      <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
        <div className="lg:col-span-8">
          <Panel className="p-8">
            <p className="label">Step One</p>
            <h2 className="display text-3xl text-ink mt-2">Connect a wallet to start a line</h2>
            <p className="text-sm text-ink-2 mt-2 max-w-md">
              You&rsquo;re the challenger — you propose the goal and seed the first bet. Connect to continue.
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

  const previewTitle = template ? fill(template.titleTemplate, value) : '';
  const previewGoal = template ? fill(template.goalTemplate, value) : '';
  const previewCriteria = template ? fill(template.criteriaTemplate, value) : '';

  function validate(): string | null {
    if (!influencer) return 'Pick the influencer you want to challenge.';
    if (influencer.wallet === wallet) return "You can't challenge yourself.";
    if (!deadline) return 'Set a deadline.';
    if (new Date(deadline).getTime() <= Date.now()) return 'The deadline must be in the future.';
    if (isCustom) {
      if (title.trim().length < 4) return 'Give it a punchy title (4+ chars).';
      if (goalText.trim().length < 10) return 'Describe the goal in a sentence (10+ chars).';
      if (successCriteria.trim().length < 10) return 'Spell out how the judge decides (10+ chars).';
    } else if (template?.valuePrompt) {
      const n = Number(value);
      if (value.trim() === '' || !Number.isFinite(n) || n <= 0) {
        return `Enter a valid ${template.valuePrompt.toLowerCase()}.`;
      }
    }
    const seed = Number(seedAmount);
    if (!Number.isFinite(seed) || seed <= 0) return 'Seed your line with a SOL bet.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setReviewError(null);

    const problem = validate();
    if (problem) {
      setSubmitError(problem);
      return;
    }

    const seedLamports = Math.round(Number(seedAmount) * LAMPORTS_PER_SOL);
    const body: CreateChallengeBody = isCustom
      ? {
          challengerWallet: wallet!,
          influencerWallet: influencer!.wallet,
          title: title.trim(),
          goalText: goalText.trim(),
          successCriteria: successCriteria.trim(),
          metricUnit: unit.trim() === '' ? undefined : unit.trim(),
          deadline: toIso(deadline),
          seedSide,
          seedAmountLamports: seedLamports,
        }
      : {
          challengerWallet: wallet!,
          influencerWallet: influencer!.wallet,
          title: previewTitle,
          goalText: previewGoal,
          successCriteria: previewCriteria,
          metricUnit: template?.unit,
          templateId: template!.id,
          deadline: toIso(deadline),
          seedSide,
          seedAmountLamports: seedLamports,
        };

    setSubmitting(true);
    try {
      let challenge;
      try {
        challenge = await api.createChallenge(body);
      } catch (err) {
        if (isCustom) {
          setReviewError(err instanceof Error ? err.message : 'This goal wasn’t accepted — make it more specific and checkable.');
          setSubmitting(false);
          return;
        }
        throw err;
      }

      // Note: no lazy account creation here — wallets pick a unique username via
      // the onboarding gate on first connect, so we must not overwrite it.

      // Best-effort on-chain market init (challenger signs). Degrades gracefully.
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
            influencer: body.influencerWallet,
            platform: authority, // platform fee recipient (reuse the oracle authority)
            creatorFeeBps: DEFAULT_CREATOR_FEE_BPS,
            platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
          });
          await api.attachMarket(challenge.id, { marketPda, vaultPda, programId });
        } catch {
          /* market step is best-effort */
        }
      }

      router.push(`/challenge/${challenge.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create the line. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
      <form className="lg:col-span-8" onSubmit={onSubmit} noValidate>
        <Panel className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="label">The Challenge</p>
            <Tag tone="muted">Challenger · {shortWallet(wallet)}</Tag>
          </div>

          {/* Influencer picker */}
          <div className="mt-6">
            <label className="label block">Challenge an influencer</label>
            <p className="text-xs text-faint mt-0.5">Search by name, or paste their wallet address.</p>
            {influencer ? (
              <div className="mt-1.5 flex items-center gap-3 border border-ink bg-paper-2 px-3 h-11">
                <span className="num text-sm text-ink truncate">{influencer.username}</span>
                <span className="num text-xs text-muted truncate">{shortWallet(influencer.wallet)}</span>
                <button
                  type="button"
                  onClick={() => { setInfluencer(null); setInfQuery(''); }}
                  className="label tracking-normal underline hover:text-accent ml-auto"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={infQuery}
                  onChange={(e) => setInfQuery(e.target.value)}
                  placeholder="@username or wallet address"
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
                />
                {infDebounced.length >= 1 && (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-auto bg-paper border border-ink shadow-[3px_3px_0_0_#17150f]">
                    {(infResults ?? []).map((u) => (
                      <button
                        key={u.wallet}
                        type="button"
                        onClick={() => setInfluencer({ wallet: u.wallet, username: u.username })}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-paper-2 text-left border-b border-line last:border-0"
                      >
                        <span className="display-tight text-sm text-ink truncate">{u.username}</span>
                        <span className="num text-xs text-muted ml-auto">{shortWallet(u.wallet)}</span>
                      </button>
                    ))}
                    {looksLikeWallet(infDebounced) && (
                      <button
                        type="button"
                        onClick={() => setInfluencer({ wallet: infDebounced.trim(), username: shortWallet(infDebounced.trim()) })}
                        className="w-full px-3 py-2.5 text-left hover:bg-paper-2 label tracking-normal text-ink"
                      >
                        Use wallet {shortWallet(infDebounced.trim())}
                      </button>
                    )}
                    {(infResults?.length ?? 0) === 0 && !looksLikeWallet(infDebounced) && (
                      <p className="px-3 py-2.5 label tracking-normal text-muted">No athletes found.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Goal dropdown */}
          <div className="mt-6">
            <label htmlFor="goalType" className="label block">The goal</label>
            <p className="text-xs text-faint mt-0.5">Pick a ready-made, judge-verifiable goal — or write your own.</p>
            <select
              id="goalType"
              value={mode}
              onChange={(e) => { setMode(e.target.value); setSubmitError(null); setReviewError(null); }}
              disabled={submitting}
              className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink font-display uppercase tracking-wide text-sm"
            >
              <option value={CUSTOM}>✦ Write your own goal</option>
              <optgroup label="Pre-made goals">
                {CHALLENGE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {!isCustom && template && (
            <div className="mt-5 space-y-5">
              {template.valuePrompt && (
                <div>
                  <label htmlFor="value" className="label block">{template.valuePrompt}</label>
                  <input
                    id="value"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. 30"
                    className="num w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
                  />
                </div>
              )}
              <div className="rule-ink pt-4">
                <p className="label text-ink">Preview</p>
                <h3 className="display text-2xl text-ink mt-1.5">{previewTitle}</h3>
                <p className="text-sm text-ink-2 mt-1.5">{previewGoal}</p>
                <div className="border border-ink bg-paper-2 p-3 mt-3">
                  <div className="label text-ink">Winning condition (the judge reads this)</div>
                  <p className="text-sm text-ink-2 mt-1.5">{previewCriteria}</p>
                </div>
              </div>
            </div>
          )}

          {isCustom && (
            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="title" className="label block">Title</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Hold a 60-second freestanding handstand"
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
                />
              </div>
              <div>
                <label htmlFor="goalText" className="label block">The goal</label>
                <textarea
                  id="goalText"
                  rows={3}
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="Plain-language description of what they have to pull off."
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 py-2 mt-1.5 text-ink placeholder:text-faint resize-y"
                />
              </div>
              <div className="rule-ink pt-4">
                <label htmlFor="successCriteria" className="label block text-ink">Success criteria</label>
                <p className="text-xs text-accent mt-0.5 font-semibold">
                  Be precise and checkable from a photo/video — the judge reads THIS at the deadline.
                </p>
                <textarea
                  id="successCriteria"
                  rows={3}
                  value={successCriteria}
                  onChange={(e) => setSuccessCriteria(e.target.value)}
                  placeholder="A single continuous video shows… (be specific about what must be visible)."
                  className="w-full bg-paper border border-line focus:border-ink outline-none px-3 py-2 mt-1.5 text-ink placeholder:text-faint resize-y"
                />
              </div>
              <div>
                <label htmlFor="unit" className="label block">Metric unit <span className="text-faint normal-case">(optional)</span></label>
                <input
                  id="unit"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="reps"
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
            <p className="text-xs text-faint mt-1.5">Bets lock 12h before this.</p>
          </div>

          {/* Seed bet */}
          <div className="mt-6 rule-ink pt-4">
            <p className="label text-ink">Seed the line — your call</p>
            <p className="text-xs text-faint mt-0.5">Back YES (they&rsquo;ll do it) or NO (they won&rsquo;t). This opens the pool.</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                aria-pressed={seedSide === 'yes'}
                onClick={() => setSeedSide('yes')}
                className={`inline-flex items-center justify-center h-10 px-4 font-display uppercase tracking-wide font-semibold border transition-colors duration-150 ${
                  seedSide === 'yes' ? 'bg-yes text-paper border-yes' : 'bg-transparent text-yes border-yes hover:bg-yes-soft'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                aria-pressed={seedSide === 'no'}
                onClick={() => setSeedSide('no')}
                className={`inline-flex items-center justify-center h-10 px-4 font-display uppercase tracking-wide font-semibold border transition-colors duration-150 ${
                  seedSide === 'no' ? 'bg-no text-paper border-no' : 'bg-transparent text-no border-no hover:bg-no-soft'
                }`}
              >
                No
              </button>
            </div>
            <div className="flex items-center border border-ink mt-2 bg-card w-full sm:w-60">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={seedAmount}
                onChange={(e) => setSeedAmount(e.target.value)}
                placeholder="0.00"
                className="num flex-1 bg-transparent px-3 h-10 text-ink outline-none placeholder:text-faint"
              />
              <span className="num text-sm text-muted px-3 border-l border-line">SOL</span>
            </div>
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
            <div className="flex items-center gap-4">
              <Button type="submit" variant="accent" size="lg" disabled={submitting}>
                {submitting ? 'Sending challenge…' : 'Send challenge'}
              </Button>
              <p className="label tracking-normal">
                {submitting ? 'Opening the line' : 'They must accept to make it live'}
              </p>
            </div>
          </div>
        </Panel>
      </form>

      <HowItWorks />
    </div>
  );
}

function HowItWorks() {
  const steps: { n: string; head: string; body: string }[] = [
    { n: '01', head: 'Challenge an influencer', body: 'Pick who, set the goal & deadline, and seed the first bet (YES or NO).' },
    { n: '02', head: 'They accept', body: 'The line goes live only once the influencer accepts the challenge.' },
    { n: '03', head: 'The board bets', body: 'Spectators stake SOL on YES or NO. Bets lock 12h before the deadline.' },
    { n: '04', head: 'The bell rings', body: 'The influencer posts final proof; an AI judge rules. Winners split the pot.' },
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
          The influencer never bets — they earn a cut of the pool once they&rsquo;re in the creator program.
          That&rsquo;s what keeps the line honest.
        </p>
      </div>
    </aside>
  );
}
