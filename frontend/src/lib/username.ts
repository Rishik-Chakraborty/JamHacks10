/**
 * Username rules + a live-availability hook, shared by the onboarding gate and
 * the edit-profile form. Format must mirror the backend (routes/users.ts):
 * 3–20 chars, letters / numbers / underscores; uniqueness is case-insensitive.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

/** Returns a human error string for a malformed username, or null if the format is valid. */
export function usernameFormatError(raw: string): string | null {
  const name = raw.trim();
  if (name.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(name)) return 'Letters, numbers, and underscores only.';
  return null;
}

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

export interface UsernameState {
  status: UsernameStatus;
  /** Error / hint message to show under the field; empty when available or idle. */
  message: string;
  /** True only when the trimmed name is valid AND confirmed free. */
  ok: boolean;
}

/**
 * Debounced availability check. `current` is the user's existing username (if any)
 * so re-saving the unchanged name reads as available. `selfWallet` excludes the
 * caller from the taken-check on the server.
 */
export function useUsernameAvailability(
  raw: string,
  selfWallet: string | undefined,
  current?: string,
): UsernameState {
  const name = raw.trim();
  const [state, setState] = useState<UsernameState>({ status: 'idle', message: '', ok: false });

  useEffect(() => {
    const formatErr = usernameFormatError(name);
    if (formatErr) {
      setState({ status: name.length === 0 ? 'idle' : 'invalid', message: name.length === 0 ? '' : formatErr, ok: false });
      return;
    }
    // Unchanged from the saved name — no need to ask the server.
    if (current && name.toLowerCase() === current.toLowerCase()) {
      setState({ status: 'available', message: '', ok: true });
      return;
    }

    setState({ status: 'checking', message: 'Checking…', ok: false });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { available, reason } = await api.checkUsername(name, selfWallet);
        if (cancelled) return;
        setState(
          available
            ? { status: 'available', message: 'Available', ok: true }
            : { status: 'taken', message: reason ?? 'That username is taken.', ok: false },
        );
      } catch {
        if (!cancelled) setState({ status: 'error', message: "Couldn't check availability.", ok: false });
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, selfWallet, current]);

  return state;
}
