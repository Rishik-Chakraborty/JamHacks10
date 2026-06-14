'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Newspaper, Plus, Wallet, User } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';

/** Bottom navigation — mobile only (hidden on md+). Mirrors the desktop nav. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const tabs = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/feed', label: 'Feed', icon: Newspaper },
    { href: '/post/new', label: 'Post', icon: Plus, center: true },
    { href: '/portfolio', label: 'Bets', icon: Wallet },
    { href: wallet ? `/u/${wallet}` : '/portfolio', label: 'Profile', icon: User },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t-2 border-ink flex items-stretch h-14"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map((t) => {
        const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
        const Icon = t.icon;
        if (t.center) {
          return (
            <Link key={t.label} href={t.href} aria-label={t.label} className="flex-1 flex items-center justify-center">
              <span className="inline-flex items-center justify-center h-10 w-10 -mt-3 bg-accent text-paper border border-accent shadow-[2px_2px_0_0_#17150f]">
                <Icon className="h-6 w-6" strokeWidth={2.5} />
              </span>
            </Link>
          );
        }
        return (
          <Link
            key={t.label}
            href={t.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? 'text-accent' : 'text-ink'}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            <span className="label tracking-normal" style={{ fontSize: '0.6rem' }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
