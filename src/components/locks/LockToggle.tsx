'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { api, errorMessage } from '@/lib/api/client';
import { formatMonthLabel, monthToQuarter, monthsInRange, quarterToMonths } from '@/lib/utils/month';

/**
 * Month lock list plus a "Lock quarter" convenience.
 *
 * Locking granularity is MONTH. The quarter button is UX only: it issues three
 * individual month locks. There is deliberately no second "quarter lock" entity
 * to keep consistent - one locking model, one thing to test, and it stays
 * correct if fiscal quarters (which do not align with calendar quarters) are
 * added later.
 */
export function LockToggle({
  from,
  to,
  lockedMonths,
  isLoading,
  onChanged,
}: {
  from: string;
  to: string;
  lockedMonths: string[];
  isLoading: boolean;
  onChanged: () => void | Promise<unknown>;
}) {
  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const [busyQuarter, setBusyQuarter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const months = monthsInRange(from, to);
  const locked = new Set(lockedMonths);

  async function toggle(month: string, currentlyLocked: boolean) {
    setError(null);
    setBusyMonth(month);
    try {
      if (currentlyLocked) {
        await api.del(`/api/locks/${month}`);
      } else {
        await api.post('/api/locks', { month });
      }
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the lock'));
    } finally {
      setBusyMonth(null);
    }
  }

  async function lockQuarter(year: number, quarter: number) {
    const key = `${year}-Q${quarter}`;
    setError(null);
    setBusyQuarter(key);
    try {
      // Sequential rather than parallel: three tiny upserts, and a serial loop
      // gives a deterministic partial state if one fails.
      for (const month of quarterToMonths(year, quarter)) {
        await api.post('/api/locks', { month });
      }
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not lock the quarter'));
    } finally {
      setBusyQuarter(null);
    }
  }

  // Distinct (year, quarter) pairs covered by the visible range.
  const quarters = [
    ...new Map(
      months.map((month) => {
        const year = Number(month.slice(0, 4));
        const quarter = monthToQuarter(month);
        return [`${year}-Q${quarter}`, { year, quarter }] as const;
      }),
    ).values(),
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Lock a whole quarter
        </span>
        {quarters.map(({ year, quarter }) => (
          <Button
            key={`${year}-Q${quarter}`}
            size="sm"
            variant="secondary"
            loading={busyQuarter === `${year}-Q${quarter}`}
            onClick={() => lockQuarter(year, quarter)}
          >
            Lock Q{quarter} {year}
          </Button>
        ))}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Month</TH>
            <TH>Status</TH>
            <TH className="text-right">Action</TH>
          </TR>
        </THead>
        <TBody>
          {isLoading && <EmptyRow colSpan={3}>Loading lock status...</EmptyRow>}
          {!isLoading && months.length === 0 && (
            <EmptyRow colSpan={3}>Pick a valid month range.</EmptyRow>
          )}
          {months.map((month) => {
            const isLocked = locked.has(month);
            return (
              <TR key={month}>
                <TD className="font-medium text-slate-900">{formatMonthLabel(month)}</TD>
                <TD>
                  {isLocked ? <Badge tone="danger">Locked</Badge> : <Badge tone="success">Open</Badge>}
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant={isLocked ? 'secondary' : 'primary'}
                    loading={busyMonth === month}
                    onClick={() => toggle(month, isLocked)}
                  >
                    {isLocked ? 'Unlock' : 'Lock'}
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
