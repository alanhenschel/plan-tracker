import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, id, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedById = hint || error ? `${selectId}-description` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900',
          'ring-1 ring-inset ring-slate-300',
          'focus:ring-2 focus:ring-inset focus:ring-slate-900',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
          error && 'ring-rose-400 focus:ring-rose-500',
          className,
        )}
        {...props}
      >
        {children}
      </select>
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
