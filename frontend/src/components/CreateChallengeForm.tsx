/**
 * CreateChallengeForm — react-hook-form + zod form that creates a challenge,
 * then (best-effort) initializes its on-chain parimutuel market.
 *
 * Flow on submit:
 *   1. api.createChallenge(body) -> new Challenge (always happens).
 *   2. Best-effort api.createUser for the connected wallet (ignore failure).
 *   3. If NEXT_PUBLIC_PROGRAM_ID + NEXT_PUBLIC_ORACLE_AUTHORITY are set AND a
 *      wallet is connected: initializeMarket(...) then api.attachMarket(...).
 *      Any chain failure is caught and surfaced WITHOUT losing the challenge.
 *   4. Redirect to /challenge/[id].
 *
 * On-chain is wrapped in @/lib/market's `initializeMarket`, which throws a
 * typed MarketClientError when the program id / wallet are missing — we treat
 * those as a graceful skip ("betting opens once the market is deployed").
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { initializeMarket, MarketClientError } from '@/lib/market';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { CreateChallengeBody, MetricType } from '@/types/contract';

const METRIC_OPTIONS: { value: MetricType; label: string; help: string }[] = [
  { value: 'visual', label: 'Visual (photo)', help: 'Judged from your final photo' },
  { value: 'weight', label: 'Bodyweight', help: 'A target bodyweight in your final photo' },
  { value: 'bench', label: 'Bench / lift', help: 'A target lift shown in your final photo' },
];

const schema = z.object({
  title: z.string().trim().min(3, 'Give it a title (3+ chars)').max(120, 'Too long'),
  goalText: z.string().trim().min(5, 'Describe the goal (5+ chars)').max(280, 'Too long'),
  successCriteria: z
    .string()
    .trim()
    .min(10, 'Be precise — the AI judges exactly this (10+ chars)')
    .max(500, 'Too long'),
  metricType: z.enum(['weight', 'bench', 'visual']),
  // datetime-local value (no timezone); validated to be in the future.
  deadline: z
    .string()
    .min(1, 'Pick a deadline')
    .refine((v) => {
      const t = Date.parse(v);
      return !Number.isNaN(t) && t > Date.now();
    }, 'Deadline must be in the future'),
});

type FormValues = z.infer<typeof schema>;

/** Minimal zod resolver (the repo has no @hookform/resolvers dep). */
const zodResolver =
  (s: typeof schema): Resolver<FormValues> =>
  async (values) => {
    const result = s.safeParse(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !errors[key]) {
        errors[key] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {}, errors: errors as never };
  };

/** Deterministic <=32-byte slug derived from the challenge id (FNV-1a hex). */
function slugFromId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 8 hex chars, prefixed so it's a readable, stable seed well under 32 bytes.
  return `gc${(h >>> 0).toString(16).padStart(8, '0')}`;
}

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? '';
const ORACLE_AUTHORITY = process.env.NEXT_PUBLIC_ORACLE_AUTHORITY ?? '';

export function CreateChallengeForm() {
  const router = useRouter();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();

  const [submitting, setSubmitting] = useState(false);
  const [chainNote, setChainNote] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { metricType: 'visual' },
  });

  const walletReady = connected && !!publicKey;
  const chainConfigured = !!PROGRAM_ID && !!ORACLE_AUTHORITY;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setTopError(null);
    setChainNote(null);

    const creatorWallet = publicKey ? publicKey.toBase58() : 'unknown';

    try {
      const body: CreateChallengeBody = {
        creatorWallet,
        title: values.title.trim(),
        goalText: values.goalText.trim(),
        successCriteria: values.successCriteria.trim(),
        metricType: values.metricType,
        deadline: new Date(values.deadline).toISOString(),
      };

      // 1. Create the challenge (authoritative — must not be lost on chain errors).
      const challenge = await api.createChallenge(body);

      // 2. Best-effort: upsert the connected user.
      if (publicKey) {
        try {
          await api.createUser({
            wallet: publicKey.toBase58(),
            username: `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`,
          });
        } catch {
          /* non-fatal */
        }
      }

      // 3. Best-effort on-chain market init.
      if (chainConfigured && walletReady && anchorWallet) {
        try {
          const { marketPda, vaultPda } = await initializeMarket({
            connection,
            wallet: anchorWallet,
            slug: slugFromId(challenge.id),
            deadline: body.deadline,
            authority: ORACLE_AUTHORITY,
          });
          await api.attachMarket(challenge.id, {
            marketPda,
            vaultPda,
            programId: PROGRAM_ID,
          });
        } catch (chainErr) {
          // Challenge already exists — surface the chain issue but still redirect.
          if (chainErr instanceof MarketClientError) {
            setChainNote(chainErr.message);
          } else {
            setChainNote(
              chainErr instanceof Error
                ? `Market not deployed: ${chainErr.message}`
                : 'Market init failed — you can deploy it later.',
            );
          }
        }
      } else {
        setChainNote(
          !chainConfigured
            ? 'Program not configured — betting opens once the market is deployed.'
            : 'Connect a wallet to deploy the betting market — challenge saved either way.',
        );
      }

      // 4. Redirect to the new challenge.
      router.push(`/challenge/${challenge.id}`);
    } catch (err) {
      setTopError(
        err instanceof Error ? err.message : 'Something went wrong creating the challenge.',
      );
      setSubmitting(false);
    }
  });

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {topError && (
          <div className="flex items-start gap-2 rounded-xl border border-no/40 bg-no/10 p-3 text-sm text-no">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{topError}</span>
          </div>
        )}

        {/* Title */}
        <Field label="Title" error={errors.title?.message}>
          <input
            {...register('title')}
            placeholder="Lose 5kg by July"
            className={inputClass}
          />
        </Field>

        {/* Goal */}
        <Field label="Goal" error={errors.goalText?.message}>
          <textarea
            {...register('goalText')}
            rows={2}
            placeholder="Drop from 80kg to 75kg with daily progress photos."
            className={inputClass}
          />
        </Field>

        {/* Success criteria */}
        <Field
          label="Success criteria"
          hint="Precise, checkable — the AI judges THIS."
          error={errors.successCriteria?.message}
        >
          <textarea
            {...register('successCriteria')}
            rows={3}
            placeholder="Final photo shows a scale reading 75.0 kg or below, full body visible."
            className={inputClass}
          />
        </Field>

        {/* Metric type */}
        <Field label="Metric type" error={errors.metricType?.message}>
          <select {...register('metricType')} className={inputClass}>
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.help}
              </option>
            ))}
          </select>
        </Field>

        {/* Deadline */}
        <Field label="Deadline" error={errors.deadline?.message}>
          <input type="datetime-local" {...register('deadline')} className={inputClass} />
        </Field>

        {/* Wallet / chain status */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {walletReady ? (
            <Badge tone="brand">
              <span className="font-mono">
                {publicKey?.toBase58().slice(0, 4)}…{publicKey?.toBase58().slice(-4)}
              </span>
            </Badge>
          ) : (
            <Badge tone="warn">No wallet — connect to deploy the market</Badge>
          )}
          {!chainConfigured && (
            <Badge tone="neutral">Program not configured · challenge-only</Badge>
          )}
        </div>

        {chainNote && (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-muted">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{chainNote}</span>
          </div>
        )}

        <Button type="submit" variant="accent" size="lg" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Creating…' : 'Create Challenge'}
        </Button>
      </form>
    </Card>
  );
}

const inputClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-xs text-no">{error}</span>}
    </label>
  );
}
