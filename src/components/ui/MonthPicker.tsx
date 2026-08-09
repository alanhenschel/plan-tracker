'use client';

import { Input } from './Input';
import { isValidMonth } from '@/lib/utils/month';

/**
 * `<input type="month">` produces exactly the YYYY-MM string the API expects,
 * with no timezone conversion, which is the main reason months are stored as
 * strings rather than Dates.
 */
export function MonthPicker({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (month: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <Input
      label={label}
      type="month"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        // Browsers can emit '' when the field is cleared; ignore that rather
        // than firing a request with an invalid month.
        if (isValidMonth(next)) onChange(next);
      }}
      className="w-44"
    />
  );
}
