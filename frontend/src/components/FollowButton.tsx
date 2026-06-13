'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Props {
  targetWallet: string;
  initialFollowing: boolean;
}

/** Follow/unfollow toggle. Optimistic, then reconciles + refreshes the profile. */
export function FollowButton({ targetWallet, initialFollowing }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const follower = publicKey?.toBase58();

  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  // Can't follow yourself or while disconnected.
  if (!follower || follower === targetWallet) return null;

  async function onToggle() {
    if (busy || !follower) return;
    const next = !following;
    setFollowing(next); // optimistic
    setBusy(true);
    try {
      const res = await api.toggleFollow(targetWallet, follower);
      setFollowing(res.following);
      await queryClient.invalidateQueries({ queryKey: ['profile', targetWallet] });
    } catch {
      setFollowing(!next); // roll back
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={following ? 'outline' : 'accent'}
      size="sm"
      onClick={onToggle}
      disabled={busy}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}
