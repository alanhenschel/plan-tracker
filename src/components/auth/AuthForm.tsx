'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { api, errorMessage } from '@/lib/api/client';

/**
 * Shared login/signup form. Both endpoints set the httpOnly session cookie
 * server-side, so the client never touches the token; it just navigates.
 */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        email,
        password,
        ...(isSignup && name.trim() ? { name: name.trim() } : {}),
      });

      // Only allow same-origin relative paths from `?next=` - an absolute URL
      // here would be an open redirect.
      const next = searchParams.get('next');
      const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

      router.replace(destination);
      // Refresh so server components re-read the new session cookie.
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in'));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {isSignup && (
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Optional"
        />
      )}

      <Input
        label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="you@company.com"
      />

      <Input
        label="Password"
        type="password"
        required
        minLength={isSignup ? 8 : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        hint={isSignup ? 'At least 8 characters.' : undefined}
      />

      <Button type="submit" loading={submitting} className="w-full">
        {isSignup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-slate-600">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-medium text-slate-900 underline underline-offset-2"
        >
          {isSignup ? 'Sign in' : 'Sign up'}
        </Link>
      </p>
    </form>
  );
}
