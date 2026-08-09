import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Sign in | Plan vs Actual' };

export default function LoginPage() {
  return (
    // AuthForm reads `?next=` via useSearchParams, which needs a Suspense
    // boundary for Next's static/streaming rendering.
    <Suspense fallback={<div className="h-64" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
