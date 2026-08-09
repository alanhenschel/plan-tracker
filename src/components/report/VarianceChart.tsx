'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatSignedCurrency } from '@/lib/utils/format';
import { formatMonthLabel } from '@/lib/utils/month';
import type { CategoryTotal, MonthlyNetVariance } from '@/lib/report/types';

/**
 * Two views over the same range, because they answer different questions:
 *
 *   - Monthly net variance: "which months went off plan, and which way?"
 *     One measure with polarity, so it is a diverging encoding - bars leave a
 *     zero baseline, direction carries the sign, and colour reinforces it.
 *     Colour is never the sole encoding: the bar's direction and the signed
 *     tooltip value both say it too.
 *   - Category totals: "where did the money go vs where we said it would?"
 *     Two categorical series (plan, actual) side by side, so a legend is
 *     mandatory and both series get their fixed palette slot.
 *
 * Palette values come from Tailwind's `viz.*` tokens (see tailwind.config.ts),
 * which were run through a CVD/contrast validator rather than picked by eye.
 */

const COLORS = {
  plan: '#2a78d6',
  actual: '#eb6834',
  over: '#d03b3b',
  under: '#2a78d6',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
};

type View = 'monthly' | 'category';

const axisTick = { fill: COLORS.muted, fontSize: 12 };

/** Compact axis labels: 20000 -> "$20k". Full precision lives in the tooltip. */
function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1_000)}k`;
  return `${value < 0 ? '-' : ''}$${abs}`;
}

/**
 * Rounded data-end anchored to the baseline: the corners away from zero are
 * rounded, the corners at zero stay square so the bar reads as growing out of
 * the axis. The 2px inset keeps a surface gap between adjacent bars.
 */
function RoundedBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  negative?: boolean;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill, negative } = props;
  if (width <= 0 || height <= 0) return null;

  const r = Math.min(4, width / 2, height);
  const inset = Math.min(1, width / 4);
  const w = width - inset * 2;
  const left = x + inset;

  // Path with two rounded corners on the data end and two square at the base.
  const d = negative
    ? `M ${left} ${y} h ${w} v ${height - r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} Z`
    : `M ${left} ${y + height} v ${-(height - r)} a ${r} ${r} 0 0 1 ${r} ${-r} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${height - r} Z`;

  return <path d={d} fill={fill} />;
}

function TooltipCard({
  label,
  items,
}: {
  label: string;
  items: { name: string; value: number; color: string; signed?: boolean }[];
}) {
  return (
    <div className="rounded-md bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-slate-900">{label}</p>
      {items.map((item) => (
        <p key={item.name} className="flex items-center gap-2 text-slate-600">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.name}</span>
          <span className="tabular ml-auto font-medium text-slate-900">
            {item.signed ? formatSignedCurrency(item.value) : formatCurrency(item.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function VarianceChart({
  monthlyNetVariance,
  categoryTotals,
}: {
  monthlyNetVariance: MonthlyNetVariance[];
  categoryTotals: CategoryTotal[];
}) {
  const [view, setView] = useState<View>('monthly');

  const monthlyData = monthlyNetVariance.map((m) => ({
    ...m,
    label: formatMonthLabel(m.month),
  }));

  const categoryData = categoryTotals.map((c) => ({
    label: c.categoryName,
    plan: c.totalPlan,
    actual: c.totalActual,
  }));

  const hasData = view === 'monthly' ? monthlyData.length > 0 : categoryData.length > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {view === 'monthly' ? 'Monthly net variance' : 'Plan vs actual by category'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {view === 'monthly'
              ? 'Actual minus plan across all categories. Bars above the line are over plan.'
              : 'Totals across the selected range.'}
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Chart view">
          <Button
            size="sm"
            variant={view === 'monthly' ? 'primary' : 'secondary'}
            onClick={() => setView('monthly')}
            aria-pressed={view === 'monthly'}
          >
            Monthly net variance
          </Button>
          <Button
            size="sm"
            variant={view === 'category' ? 'primary' : 'secondary'}
            onClick={() => setView('category')}
            aria-pressed={view === 'category'}
          >
            Category totals
          </Button>
        </div>
      </div>

      {!hasData ? (
        <p className="py-16 text-center text-sm text-slate-500">
          No data in this range to chart.
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {view === 'monthly' ? (
              <BarChart data={monthlyData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.axis }}
                />
                <YAxis
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={compactCurrency}
                />
                <ReferenceLine y={0} stroke={COLORS.axis} strokeWidth={1} />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipCard
                        label={String(label)}
                        items={[
                          {
                            name: 'Net variance',
                            value: Number(payload[0].value ?? 0),
                            color: Number(payload[0].value ?? 0) > 0 ? COLORS.over : COLORS.under,
                            signed: true,
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                {/* Single measure - no legend box; the heading names it and the
                    sign is carried by bar direction as well as colour. */}
                <Bar
                  dataKey="netVariance"
                  name="Net variance"
                  isAnimationActive={false}
                  shape={(props: object) => {
                    const bar = props as { height?: number; y?: number; payload?: { netVariance: number } };
                    const negative = (bar.payload?.netVariance ?? 0) < 0;
                    return <RoundedBar {...bar} negative={negative} />;
                  }}
                >
                  {monthlyData.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={entry.netVariance > 0 ? COLORS.over : COLORS.under}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart
                data={categoryData}
                margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
                barGap={2}
              >
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.axis }}
                />
                <YAxis
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={compactCurrency}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipCard
                        label={String(label)}
                        items={payload.map((entry) => ({
                          name: entry.name === 'plan' ? 'Plan' : 'Actual',
                          value: Number(entry.value ?? 0),
                          color: entry.name === 'plan' ? COLORS.plan : COLORS.actual,
                        }))}
                      />
                    ) : null
                  }
                />
                {/* Two series - a legend is mandatory so identity is never colour-alone. */}
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => (
                    <span className="text-xs text-slate-600">
                      {value === 'plan' ? 'Plan' : 'Actual'}
                    </span>
                  )}
                />
                <Bar
                  dataKey="plan"
                  fill={COLORS.plan}
                  isAnimationActive={false}
                  shape={(props: object) => <RoundedBar {...(props as object)} />}
                />
                <Bar
                  dataKey="actual"
                  fill={COLORS.actual}
                  isAnimationActive={false}
                  shape={(props: object) => <RoundedBar {...(props as object)} />}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
