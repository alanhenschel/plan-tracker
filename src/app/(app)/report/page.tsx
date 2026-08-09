'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DateRangePicker } from '@/components/report/DateRangePicker';
import { ReportTable } from '@/components/report/ReportTable';
import { VarianceChart } from '@/components/report/VarianceChart';
import { DrillDownModal } from '@/components/report/DrillDownModal';
import { reportUrls, useCategories, useReport } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/client';
import { formatCurrency, formatSignedCurrency, varianceToneClass } from '@/lib/utils/format';
import type { ReportRow } from '@/lib/report/types';

/**
 * The report screen. All numbers come straight from `/api/report`, which
 * delegates to the pure aggregation module - the UI does no variance math of
 * its own, so what is on screen is exactly what the tests assert.
 */
export default function ReportPage() {
  const [from, setFrom] = useState('2026-01');
  const [to, setTo] = useState('2026-03');
  const [categoryId, setCategoryId] = useState('');
  const [drillDownRow, setDrillDownRow] = useState<ReportRow | null>(null);

  const categoriesQuery = useCategories();
  const reportQuery = useReport(from, to, categoryId || undefined);

  const report = reportQuery.data;
  const rows = report?.rows ?? [];

  const totals = rows.reduce(
    (acc, row) => ({
      plan: acc.plan + row.plan,
      actual: acc.actual + row.actual,
      variance: acc.variance + row.variance,
    }),
    { plan: 0, actual: 0, variance: 0 },
  );

  function handleRangeChange(next: { from?: string; to?: string; categoryId?: string }) {
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    if (next.categoryId !== undefined) setCategoryId(next.categoryId);
  }

  return (
    <>
      <PageHeader
        title="Report"
        description="Plan vs actual by category and month. A missing actual counts as 0; when the plan is 0 the percentage is undefined and shown as a dash."
        action={
          <a href={reportUrls(from, to, categoryId || undefined).csv} download>
            <Button variant="secondary" size="sm">
              Export CSV
            </Button>
          </a>
        }
      />

      <div className="space-y-6">
        <Card>
          <DateRangePicker
            from={from}
            to={to}
            categoryId={categoryId}
            categories={categoriesQuery.data?.categories ?? []}
            onChange={handleRangeChange}
          />
        </Card>

        {reportQuery.error && <Alert tone="error">{errorMessage(reportQuery.error)}</Alert>}

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Total plan" value={formatCurrency(totals.plan)} />
          <SummaryTile label="Total actual" value={formatCurrency(totals.actual)} />
          <SummaryTile
            label="Net variance"
            value={formatSignedCurrency(totals.variance)}
            valueClass={varianceToneClass(totals.variance)}
          />
        </div>

        <Card>
          <VarianceChart
            monthlyNetVariance={report?.monthlyNetVariance ?? []}
            categoryTotals={report?.categoryTotals ?? []}
          />
        </Card>

        <div>
          <p className="mb-2 text-xs text-slate-500">
            Select a row to see the individual entries behind it.
          </p>
          <ReportTable
            rows={rows}
            isLoading={reportQuery.isLoading}
            onDrillDown={setDrillDownRow}
          />
        </div>
      </div>

      <DrillDownModal row={drillDownRow} onClose={() => setDrillDownRow(null)} />
    </>
  );
}

function SummaryTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold text-slate-900 ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}
