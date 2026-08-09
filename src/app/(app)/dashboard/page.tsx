'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { useCategories, useLocks, useReport } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/client';
import {
  EM_DASH,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  varianceToneClass,
} from '@/lib/utils/format';
import { addMonths, currentMonth, formatMonthLabel } from '@/lib/utils/month';

/**
 * Landing view: the last six months at a glance, with the worst variances
 * surfaced first so the number that needs attention is the one you see.
 */
export default function DashboardPage() {
  const to = currentMonth();
  const from = addMonths(to, -5);

  const reportQuery = useReport(from, to);
  const locksQuery = useLocks(from, to);
  const categoriesQuery = useCategories();

  const rows = reportQuery.data?.rows ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      plan: acc.plan + row.plan,
      actual: acc.actual + row.actual,
      variance: acc.variance + row.variance,
    }),
    { plan: 0, actual: 0, variance: 0 },
  );

  // Biggest absolute variances first - the rows a finance reviewer opens with.
  const attention = [...rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 5);

  const lockedCount = locksQuery.data?.lockedMonths.length ?? 0;
  const categoryCount = categoriesQuery.data?.categories.length ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Rolling six months, ${formatMonthLabel(from)} to ${formatMonthLabel(to)}.`}
      />

      {reportQuery.error && (
        <Alert tone="error" className="mb-4">
          {errorMessage(reportQuery.error)}
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total plan" value={formatCurrency(totals.plan)} />
        <Tile label="Total actual" value={formatCurrency(totals.actual)} />
        <Tile
          label="Net variance"
          value={formatSignedCurrency(totals.variance)}
          valueClass={varianceToneClass(totals.variance)}
        />
        <Tile label="Locked months" value={String(lockedCount)} />
      </div>

      {!reportQuery.isLoading && rows.length === 0 && (
        <Alert tone="info" className="mb-6">
          Nothing here yet.{' '}
          {categoryCount === 0 ? (
            <>
              Start by adding a{' '}
              <Link href="/categories" className="font-medium underline underline-offset-2">
                category
              </Link>
              .
            </>
          ) : (
            <>
              Set some{' '}
              <Link href="/plans" className="font-medium underline underline-offset-2">
                targets
              </Link>{' '}
              and log your{' '}
              <Link href="/actuals" className="font-medium underline underline-offset-2">
                actuals
              </Link>
              .
            </>
          )}
        </Alert>
      )}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Largest variances</h2>
          <Link href="/report" className="text-sm font-medium text-slate-900 underline underline-offset-2">
            Full report
          </Link>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Month</TH>
              <TH>Category</TH>
              <TH numeric>Plan</TH>
              <TH numeric>Actual</TH>
              <TH numeric>Variance</TH>
              <TH numeric>Variance %</TH>
              <TH>Period</TH>
            </TR>
          </THead>
          <TBody>
            {reportQuery.isLoading && <EmptyRow colSpan={7}>Loading...</EmptyRow>}
            {!reportQuery.isLoading && attention.length === 0 && (
              <EmptyRow colSpan={7}>No data in the last six months.</EmptyRow>
            )}
            {attention.map((row) => (
              <TR key={`${row.categoryId}-${row.month}`}>
                <TD>{formatMonthLabel(row.month)}</TD>
                <TD className="font-medium text-slate-900">{row.categoryName}</TD>
                <TD numeric>{formatCurrency(row.plan)}</TD>
                <TD numeric>{formatCurrency(row.actual)}</TD>
                <TD numeric className={varianceToneClass(row.variance)}>
                  {formatSignedCurrency(row.variance)}
                </TD>
                <TD numeric className={row.variancePct === null ? 'text-slate-400' : varianceToneClass(row.variance)}>
                  {row.variancePct === null ? EM_DASH : formatPercent(row.variancePct)}
                </TD>
                <TD>
                  {row.isLocked ? <Badge tone="danger">Locked</Badge> : <Badge tone="success">Open</Badge>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function Tile({
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
