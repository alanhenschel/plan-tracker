import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Sign up | Plan vs Actual' };

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
