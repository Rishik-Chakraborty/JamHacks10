'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/types/contract';
import { api } from '@/lib/api';
import { useUsernameAvailability, USERNAME_MAX } from '@/lib/username';
import { UsernameHint } from '@/components/OnboardingGate';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';

interface Props {
  wallet: string;
  user: User | null;
}

const AVATAR_SIDE = 256;

/** Resize an image File to a square AVATAR_SIDE JPEG data URL (object-cover crop). */
function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIDE;
      canvas.height = AVATAR_SIDE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is not available in this browser.'));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

export function EditProfile({ wallet, user }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live unique-username validation (excludes the user's own current name).
  const check = useUsernameAvailability(username, wallet, user?.username);

  async function onAvatar(file: File) {
    setError(null);
    try {
      setAvatar(await resizeAvatar(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process that image.');
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!check.ok) {
      setError(check.message || 'Pick an available username.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({
        wallet,
        username: name,
        bio: bio.trim() === '' ? undefined : bio.trim(),
        avatar,
      });
      await queryClient.invalidateQueries({ queryKey: ['profile', wallet] });
      await queryClient.invalidateQueries({ queryKey: ['account', wallet] });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit profile
      </Button>
    );
  }

  return (
    <Panel className="p-4 mt-4 w-full max-w-lg">
      <h3 className="display text-xl text-ink">Edit profile</h3>
      <form onSubmit={onSave} className="rule mt-3 pt-4 flex flex-col gap-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 shrink-0 border border-line bg-ink">
            {avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatar} alt="avatar preview" className="block w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="label text-paper">none</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {avatar ? 'Replace photo' : 'Upload photo'}
            </Button>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar(undefined)}
                disabled={busy}
                className="label tracking-normal underline hover:text-accent disabled:opacity-40"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onAvatar(f);
            }}
          />
        </div>

        {/* Username (unique) */}
        <label className="block">
          <span className="label">Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="3–20 letters, numbers, or _"
            maxLength={USERNAME_MAX}
            disabled={busy}
            className="mt-1.5 w-full h-10 px-3 bg-card border border-line text-ink placeholder:text-faint focus:border-ink focus:outline-none"
          />
          <UsernameHint status={check.status} message={check.message} />
        </label>

        {/* Bio */}
        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="label">Bio</span>
            <span className="num text-xs text-faint">{bio.length}/160</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="optional — your one-liner"
            rows={2}
            maxLength={160}
            disabled={busy}
            className="mt-1.5 w-full bg-card border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none resize-none"
          />
        </label>

        {error && (
          <div className="border border-no bg-no-soft px-3 py-2">
            <span className="label text-no">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="accent" size="md" disabled={busy || !check.ok}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className="label tracking-normal underline hover:text-accent disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
