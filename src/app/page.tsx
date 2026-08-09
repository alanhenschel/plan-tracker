import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/getSessionUser';

export const dynamic = 'force-dynamic';

/** Root is a router only: signed in goes to the dashboard, otherwise login. */
export default async function HomePage() {
  const user = await getSessionUser();
  redirect(user ? '/dashboard' : '/login');
}
