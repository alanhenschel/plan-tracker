import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type Tone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<Tone, string> = {
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  error: 'bg-rose-50 text-rose-900 ring-rose-200',
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      // `alert` for errors so screen readers announce a failed submit.
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md px-3 py-2 text-sm ring-1 ring-inset', TONES[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children}
    </div>
  );
}
