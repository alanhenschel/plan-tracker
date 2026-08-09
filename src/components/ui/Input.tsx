import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = hint || error ? `${inputId}-description` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900',
          'ring-1 ring-inset ring-slate-300 placeholder:text-slate-400',
          'focus:ring-2 focus:ring-inset focus:ring-slate-900',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
          error && 'ring-rose-400 focus:ring-rose-500',
          className,
        )}
        {...props}
      />
      {(hint || error) && (
        <p
          id={describedById}
          className={cn('mt-1 text-xs', error ? 'text-rose-600' : 'text-slate-500')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
