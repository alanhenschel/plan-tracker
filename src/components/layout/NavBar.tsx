'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plans', label: 'Plans' },
  { href: '/actuals', label: 'Actuals' },
  { href: '/report', label: 'Report' },
  { href: '/locks', label: 'Locks' },
  { href: '/categories', label: 'Categories' },
];

export function NavBar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Navigate regardless: if the request failed the cookie may still be
      // gone, and leaving the user stuck on an authed page is worse.
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">Plan vs Actual</span>

        <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          <Button variant="secondary" size="sm" onClick={handleSignOut} loading={signingOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
