'use client';

import { Badge } from '@/components/ui/Badge';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import {
  EM_DASH,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  varianceToneClass,
} from '@/lib/utils/format';
import { formatMonthLabel } from '@/lib/utils/month';
import type { ReportRow } from '@/lib/report/types';

/**
 * The plan-vs-actual table.
 *
 * Two documented rendering rules live here:
 *   - `variancePct === null` (plan is 0) renders as an em dash, never NaN.
 *   - A missing actual renders as the number 0, because the policy is to treat
 *     it as 0 in the math. It is annotated "no entries" so the reader can still
 *     tell a defaulted zero from a genuinely logged zero.
 */
export function ReportTable({
  rows,
  isLoading,
  onDrillDown,
}: {
  rows: ReportRow[];
  isLoading: boolean;
  onDrillDown: (row: ReportRow) => void;
}) {
  return (
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
        {isLoading && <EmptyRow colSpan={7}>Loading report...</EmptyRow>}
        {!isLoading && rows.length === 0 && (
          <EmptyRow colSpan={7}>
            Nothing to report in this range. Set some targets or log actuals first.
          </EmptyRow>
        )}
        {rows.map((row) => (
          <TR
            key={`${row.categoryId}-${row.month}`}
            className="cursor-pointer hover:bg-slate-50"
            onClick={() => onDrillDown(row)}
            tabIndex={0}
            role="button"
            aria-label={`Show underlying entries for ${row.categoryName} in ${row.month}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onDrillDown(row);
              }
            }}
          >
            <TD>{formatMonthLabel(row.month)}</TD>
            <TD className="font-medium text-slate-900">{row.categoryName}</TD>
            <TD numeric>
              {formatCurrency(row.plan)}
              {!row.hasPlan && (
                <span className="ml-1 text-xs text-slate-400" title="No target set">
                  (no target)
                </span>
              )}
            </TD>
            <TD numeric>
              {formatCurrency(row.actual)}
              {!row.hasActual && (
                <span
                  className="ml-1 text-xs text-slate-400"
                  title="No entries logged - treated as 0"
                >
                  (no entries)
                </span>
              )}
            </TD>
            <TD numeric className={varianceToneClass(row.variance)}>
              {formatSignedCurrency(row.variance)}
            </TD>
            <TD
              numeric
              className={row.variancePct === null ? 'text-slate-400' : varianceToneClass(row.variance)}
              title={row.variancePct === null ? 'Plan is 0, so the percentage is undefined' : undefined}
            >
              {row.variancePct === null ? EM_DASH : formatPercent(row.variancePct)}
            </TD>
            <TD>
              {row.isLocked ? <Badge tone="danger">Locked</Badge> : <Badge tone="success">Open</Badge>}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
