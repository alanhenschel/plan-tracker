'use client';

import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { useActuals } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/client';
import { formatCurrency, formatPercent, formatSignedCurrency, EM_DASH } from '@/lib/utils/format';
import { formatMonthLabel } from '@/lib/utils/month';
import type { ReportRow } from '@/lib/report/types';

/**
 * Stretch goal "Drill-down": the individual actual entries behind one report
 * cell. This is where the ledger model pays off - the report sums several
 * entries, and this view shows the ones that make up the total, with their
 * notes and whether they came from a CSV import.
 */
export function DrillDownModal({ row, onClose }: { row: ReportRow | null; onClose: () => void }) {
  // The hook must run unconditionally; passing null from/to gives SWR a null
  // key, so no request fires until a row is actually selected.
  const { data, error, isLoading } = useActuals(
    row?.month ?? null,
    row?.month ?? null,
    row?.categoryId,
  );

  const entries = row ? (data?.actuals ?? []) : [];
  const loggedTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title={row ? `${row.categoryName} - ${formatMonthLabel(row.month)}` : 'Entries'}
    >
      {row && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Plan" value={formatCurrency(row.plan)} />
            <Stat label="Actual" value={formatCurrency(row.actual)} />
            <Stat label="Variance" value={formatSignedCurrency(row.variance)} />
            <Stat
              label="Variance %"
              value={row.variancePct === null ? EM_DASH : formatPercent(row.variancePct)}
            />
          </dl>

          {row.isLocked && (
            <Alert tone="warning">
              This period is locked. These entries are read-only until it is reopened.
            </Alert>
          )}

          {!row.hasActual && (
            <Alert tone="info">
              No actuals were logged for this category and month. The report treats the
              actual as 0, which is why the variance is the full negative of the plan.
            </Alert>
          )}

          {error && <Alert tone="error">{errorMessage(error)}</Alert>}

          <Table>
            <THead>
              <TR>
                <TH numeric>Amount</TH>
                <TH>Note</TH>
                <TH>Source</TH>
              </TR>
            </THead>
            <TBody>
              {isLoading && <EmptyRow colSpan={3}>Loading entries...</EmptyRow>}
              {!isLoading && entries.length === 0 && (
                <EmptyRow colSpan={3}>No entries logged.</EmptyRow>
              )}
              {entries.map((entry) => (
                <TR key={entry.id}>
                  <TD numeric>{formatCurrency(entry.amount)}</TD>
                  <TD className="whitespace-normal text-slate-500">{entry.note ?? ''}</TD>
                  <TD>
                    <Badge tone={entry.source === 'csv_import' ? 'info' : 'neutral'}>
                      {entry.source === 'csv_import' ? 'CSV' : 'Manual'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          {entries.length > 0 && (
            <p className="text-right text-sm text-slate-600">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} totalling{' '}
              <span className="tabular font-medium text-slate-900">
                {formatCurrency(loggedTotal)}
              </span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
