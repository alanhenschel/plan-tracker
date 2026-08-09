import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Thin semantic wrappers around table elements so every table in the app has
 * the same density, borders and numeric alignment.
 */

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    // Horizontal scroll container: report tables get wide on small screens.
    <div className="w-full overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className={cn('min-w-full divide-y divide-slate-200 bg-white', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-slate-50', className)} {...props}>
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-slate-100', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TR({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn(className)} {...props}>
      {children}
    </tr>
  );
}

interface CellProps {
  numeric?: boolean;
}

export function TH({
  className,
  numeric,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({
  className,
  numeric,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-3 py-2.5 text-sm text-slate-700',
        numeric && 'tabular text-right',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}
