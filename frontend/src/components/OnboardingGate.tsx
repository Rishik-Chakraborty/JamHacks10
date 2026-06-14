'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import { useUsernameAvailability, USERNAME_MAX } from '@/lib/username';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';

/**
 * Forces a freshly-connected wallet with no account to pick a unique username
 * before using the app. Mounted once globally in the root layout. Renders
 * nothing until a wallet is connected and confirmed to have no account yet.
 */
export function OnboardingGate() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const queryClient = useQueryClient();

  const { data: account, isLoading } = useQuery({
    queryKey: ['account', wallet],
    queryFn: () => api.getUserSafe(wallet!),
    enabled: !!wallet,
  });

  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const check = useUsernameAvailability(username, wallet);

  const save = useMutation({
    mutationFn: () => api.updateProfile({ wallet: wallet!, username: username.trim() }),
    onSuccess: async (user) => {
      // Prime the gate query so the modal closes immediately, then refresh views.
      queryClient.setQueryData(['account', wallet], user);
      await queryClient.invalidateQueries({ queryKey: ['profile', wallet] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not save your username.'),
  });

  // Only gate once we KNOW there's no account (query resolved to null).
  const needsOnboarding = !!wallet && !isLoading && account === null;
  if (!needsOnboarding) return null;

  const busy = save.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!check.ok) {
      setError(check.message || 'Pick an available username.');
      return;
    }
    save.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-5">
      <Panel className="w-full max-w-md p-6">
        <p className="label">Welcome to the gainsXchange</p>
        <h2 className="display text-2xl text-ink mt-1">Claim your username</h2>
        <p className="text-sm text-ink-2 mt-1.5">
          This is how you&rsquo;ll show up across the feed. It must be unique — pick wisely.
        </p>

        <form onSubmit={onSubmit} className="rule mt-4 pt-4 flex flex-col gap-3">
          <label className="block">
            <span className="label">Username</span>
            <input
              type="text"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ironmike_92"
              maxLength={USERNAME_MAX}
              disabled={busy}
              className="mt-1.5 w-full h-10 px-3 bg-card border border-line text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
            <UsernameHint status={check.status} message={check.message} />
          </label>

          {error && (
            <div className="border border-no bg-no-soft px-3 py-2">
              <span className="label text-no">{error}</span>
            </div>
          )}

          <Button type="submit" variant="accent" size="md" disabled={busy || !check.ok}>
            {busy ? 'Claiming…' : 'Claim username'}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

/** Inline availability feedback shown under a username input. */
export function UsernameHint({ status, message }: { status: string; message: string }) {
  if (!message) return null;
  const tone =
    status === 'available' ? 'text-yes' : status === 'checking' ? 'text-faint' : 'text-no';
  return <span className={`label tracking-normal mt-1.5 block ${tone}`}>{message}</span>;
}
