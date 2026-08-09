import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/getSessionUser';
import { NavBar } from '@/components/layout/NavBar';

export const dynamic = 'force-dynamic';

/**
 * Auth-gated shell for every signed-in page.
 *
 * This is the real page-level gate: `src/middleware.ts` only checks the cookie
 * signature on the Edge, while this runs on the server with DB access and
 * confirms the user record still exists.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <NavBar email={user.email} />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
