'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { z } from 'zod';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import { shortWallet } from '@/lib/format';
import type { CreateChallengeBody, MetricType } from '@/types/contract';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Tag } from '@/components/ui/Tag';

// Wallet button is browser-only — load client-side to avoid hydration mismatch.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

/* ---------------------------------------------------------------------------
 * Form shape + validation. We avoid @hookform/resolvers (not installed) and
 * instead parse the raw values through zod inside onSubmit.
 * ------------------------------------------------------------------------ */

interface FormValues {
  title: string;
  goalText: string;
  successCriteria: string;
  metricType: MetricType;
  deadline: string; // value of <input type="datetime-local"> (local, no tz)
}

const METRICS: { value: MetricType; label: string; hint: string }[] = [
  { value: 'weight', label: 'Weight', hint: 'Bodyweight / scale reading' },
  { value: 'bench', label: 'Bench', hint: 'Logged lift number' },
  { value: 'visual', label: 'Visual', hint: 'Judged from a photo' },
];

const schema = z.object({
  title: z.string().trim().min(4, 'Give it a punchy title (4+ chars).').max(120, 'Keep the title under 120 chars.'),
  goalText: z
    .string()
    .trim()
    .min(10, 'Describe the goal in a sentence (10+ chars).')
    .max(600, 'Keep the goal under 600 chars.'),
  successCriteria: z
    .string()
    .trim()
    .min(10, 'Spell out exactly how the judge decides (10+ chars).')
    .max(600, 'Keep the criteria under 600 chars.'),
  metricType: z.enum(['weight', 'bench', 'visual']),
  deadline: z
    .string()
    .min(1, 'Set a deadline.')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'That date is unreadable.')
    .refine((v) => new Date(v).getTime() > Date.now(), 'The deadline must be in the future.'),
});

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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [marketNote, setMarketNote] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { title: '', goalText: '', successCriteria: '', metricType: 'visual', deadline: '' },
  });

  const wallet = publicKey?.toBase58() ?? null;

  /* ---- Wallet gate: show a connect prompt instead of the form body. ---- */
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

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    setMarketNote(null);

    // Manual zod parse — surface field errors inline, mirror to react-hook-form.
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          setError(field as keyof FormValues, { type: 'manual', message: issue.message });
        }
      }
      return;
    }

    const v = parsed.data;
    const body: CreateChallengeBody = {
      creatorWallet: wallet,
      title: v.title,
      goalText: v.goalText,
      successCriteria: v.successCriteria,
      metricType: v.metricType,
      deadline: toIso(v.deadline),
    };

    setSubmitting(true);
    try {
      const challenge = await api.createChallenge(body);

      // Best-effort: register the creator as a user. Never blocks the flow.
      await api.createUser({ wallet, username: shortWallet(wallet) }).catch(() => {});

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
          // A MarketClientError (NO_PROGRAM/NO_WALLET) or any chain failure must
          // NOT lose the created challenge — note it and continue to the page.
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
  };

  const fieldErr = (msg?: string) =>
    msg ? <p className="text-xs text-no mt-1.5">{msg}</p> : null;

  return (
    <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
      {/* Left column — the form */}
      <form className="lg:col-span-8" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Panel className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="label">The Terms</p>
            <Tag tone="muted">Athlete · {shortWallet(wallet)}</Tag>
          </div>

          {/* Title */}
          <div className="mt-6">
            <label htmlFor="title" className="label block">
              Title
            </label>
            <input
              id="title"
              type="text"
              placeholder="Drop to sub-12% body fat by August"
              className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink placeholder:text-faint"
              {...register('title')}
            />
            {fieldErr(errors.title?.message)}
          </div>

          {/* Goal */}
          <div className="mt-5">
            <label htmlFor="goalText" className="label block">
              The Goal
            </label>
            <p className="text-xs text-faint mt-0.5">Plain-language pitch shown on the card.</p>
            <textarea
              id="goalText"
              rows={3}
              placeholder="Cut to single-digit body fat in eight weeks, training six days a week."
              className="w-full bg-paper border border-line focus:border-ink outline-none px-3 py-2 mt-1.5 text-ink placeholder:text-faint resize-y"
              {...register('goalText')}
            />
            {fieldErr(errors.goalText?.message)}
          </div>

          {/* Success criteria — load-bearing helper text. */}
          <div className="mt-5 rule-ink pt-4">
            <label htmlFor="successCriteria" className="label block text-ink">
              Success Criteria
            </label>
            <p className="text-xs text-accent mt-0.5 font-semibold">
              Be precise and checkable — the AI judge reads THIS at the deadline.
            </p>
            <textarea
              id="successCriteria"
              rows={3}
              placeholder="Final photo shows visible abdominal definition; scale reads 175 lb or less."
              className="w-full bg-paper border border-line focus:border-ink outline-none px-3 py-2 mt-1.5 text-ink placeholder:text-faint resize-y"
              {...register('successCriteria')}
            />
            {fieldErr(errors.successCriteria?.message)}
          </div>

          {/* Metric + deadline */}
          <div className="grid sm:grid-cols-2 gap-5 mt-6">
            <div>
              <span className="label block">Metric Type</span>
              <div className="grid grid-cols-3 mt-1.5 border border-line divide-x divide-line">
                {METRICS.map((m) => (
                  <label
                    key={m.value}
                    className="flex flex-col items-center justify-center py-2.5 cursor-pointer has-[:checked]:bg-ink has-[:checked]:text-paper transition-colors"
                    title={m.hint}
                  >
                    <input type="radio" value={m.value} className="sr-only" {...register('metricType')} />
                    <span className="font-display uppercase tracking-wide text-sm">{m.label}</span>
                  </label>
                ))}
              </div>
              {fieldErr(errors.metricType?.message)}
            </div>

            <div>
              <label htmlFor="deadline" className="label block">
                Deadline
              </label>
              <input
                id="deadline"
                type="datetime-local"
                min={minDatetimeLocal()}
                className="num w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink"
                {...register('deadline')}
              />
              {fieldErr(errors.deadline?.message)}
            </div>
          </div>

          {/* Submit + states */}
          <div className="rule pt-5 mt-7">
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
                {submitting ? 'Opening…' : 'Open the line'}
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
    { n: '01', head: 'Set the terms', body: 'Title, goal, and the exact criteria the judge will check.' },
    { n: '02', head: 'Sign the market', body: 'Your wallet opens a parimutuel pool keyed to this line.' },
    { n: '03', head: 'The board reacts', body: 'Spectators stake SOL on YES or NO. Odds move live.' },
    { n: '04', head: 'The bell rings', body: 'At the deadline an AI judge reads your proof. Winners split the pot.' },
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
