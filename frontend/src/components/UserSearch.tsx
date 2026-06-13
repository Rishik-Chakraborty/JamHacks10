'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { User } from '@/types/contract';
import { api } from '@/lib/api';
import { shortWallet } from '@/lib/format';

/** Two uppercase initials for the avatar fallback. */
function initials(handle: string): string {
  const clean = handle.replace(/[^a-zA-Z0-9]/g, '');
  return clean.slice(0, 2).toUpperCase() || '??';
}

export function UserSearch() {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  // Debounce the typed query.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const { data, isFetching } = useQuery<User[]>({
    queryKey: ['userSearch', debounced],
    queryFn: () => api.searchUsers(debounced),
    enabled: debounced.length >= 1,
    staleTime: 10_000,
  });

  function go(wallet: string) {
    setOpen(false);
    setQ('');
    router.push(`/u/${wallet}`);
  }

  const results = data ?? [];
  const showPanel = open && debounced.length >= 1;

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 border border-line focus-within:border-ink bg-paper px-2.5 h-9 w-40 sm:w-52">
        <Search className="h-4 w-4 text-muted shrink-0" strokeWidth={2} />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search athletes"
          className="w-full bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
        />
      </div>

      {showPanel && (
        <div className="absolute right-0 mt-1 w-72 max-h-96 overflow-auto bg-paper border border-ink z-40 shadow-[3px_3px_0_0_#17150f]">
          {isFetching && results.length === 0 ? (
            <p className="px-3 py-3 label tracking-normal text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 label tracking-normal text-muted">No athletes found.</p>
          ) : (
            <ul>
              {results.map((u) => (
                <li key={u.wallet}>
                  <button
                    type="button"
                    onClick={() => go(u.wallet)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-paper-2 text-left border-b border-line last:border-0"
                  >
                    {u.avatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={u.avatar} alt={u.username} className="h-8 w-8 object-cover border border-ink shrink-0" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center bg-ink text-paper font-display text-xs shrink-0">
                        {initials(u.username || u.wallet)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="display-tight text-sm text-ink block truncate">{u.username}</span>
                      <span className="num text-xs text-muted block truncate">{shortWallet(u.wallet)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
