'use client';

import { Button } from '@/components/ui/Button';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { Select } from '@/components/ui/Select';
import { quarterToMonths } from '@/lib/utils/month';
import type { CategoryDto } from '@/lib/api/types';

/**
 * Range + category filter for the report.
 *
 * The presets exist because the spec's example range is "Q1 2026"; typing two
 * month fields to express a quarter is the kind of friction that makes a
 * reporting screen annoying to demo.
 */

interface Preset {
  label: string;
  from: string;
  to: string;
}

function quarterPreset(year: number, quarter: number): Preset {
  const months = quarterToMonths(year, quarter);
  return { label: `Q${quarter} ${year}`, from: months[0], to: months[2] };
}

export function DateRangePicker({
  from,
  to,
  categoryId,
  categories,
  onChange,
}: {
  from: string;
  to: string;
  categoryId: string;
  categories: CategoryDto[];
  onChange: (next: { from?: string; to?: string; categoryId?: string }) => void;
}) {
  const year = Number(from.slice(0, 4));
  const presets: Preset[] = [
    quarterPreset(year, 1),
    quarterPreset(year, 2),
    quarterPreset(year, 3),
    quarterPreset(year, 4),
    { label: `FY ${year}`, from: `${year}-01`, to: `${year}-12` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <MonthPicker label="From" value={from} onChange={(v) => onChange({ from: v })} max={to} />
        <MonthPicker label="To" value={to} onChange={(v) => onChange({ to: v })} min={from} />

        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
          className="w-52"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Presets</span>
        {presets.map((preset) => {
          const active = preset.from === from && preset.to === to;
          return (
            <Button
              key={preset.label}
              size="sm"
              variant={active ? 'primary' : 'secondary'}
              onClick={() => onChange({ from: preset.from, to: preset.to })}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
