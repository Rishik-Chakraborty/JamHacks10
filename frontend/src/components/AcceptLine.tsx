'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Challenge, ChallengeDetail } from '@/types/contract';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { shortWallet } from '@/lib/format';

interface Props {
  challenge: Challenge | ChallengeDetail;
}

/**
 * Accept / decline panel shown to the challenged influencer while a line is
 * awaiting their decision. Accepting opens the line for betting; declining
 * refunds the challenger's seed.
 */
export function AcceptLine({ challenge }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const wallet = publicKey?.toBase58();

  const [busy, setBusy] = useState<null | 'accept' | 'decline'>(null);
  const [error, setError] = useState<string | null>(null);

  const isInfluencer = wallet === challenge.creatorWallet;
  if (challenge.status !== 'pending_accept' || !isInfluencer) return null;

  async function act(kind: 'accept' | 'decline') {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'accept') await api.acceptLine(challenge.id, wallet!);
      else await api.declineLine(challenge.id, wallet!);
      await queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the line.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="p-4 border-accent">
      <h3 className="display text-xl text-ink">You&rsquo;ve been challenged</h3>
      <p className="text-sm text-ink-2 mt-1.5">
        {challenge.challengerWallet ? `${shortWallet(challenge.challengerWallet)} ` : 'Someone '}
        put up a line on you. Accept to make it live and let the board bet — or decline to refund it.
      </p>
      {error && (
        <div className="border border-no bg-no-soft px-3 py-2 mt-3">
          <span className="label text-no">{error}</span>
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <Button type="button" variant="accent" size="md" onClick={() => act('accept')} disabled={busy !== null}>
          {busy === 'accept' ? 'Accepting…' : 'Accept challenge'}
        </Button>
        <Button type="button" variant="outline" size="md" onClick={() => act('decline')} disabled={busy !== null}>
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </Button>
      </div>
    </Panel>
  );
}
