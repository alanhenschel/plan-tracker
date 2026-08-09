import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Plan vs Actual Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monthly targets, real spend, and the variance between them.
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">{children}</div>
      </div>
    </main>
  );
}
