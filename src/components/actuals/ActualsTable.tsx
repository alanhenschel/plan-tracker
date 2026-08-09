'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { api, errorMessage } from '@/lib/api/client';
import { formatCurrency } from '@/lib/utils/format';
import { formatMonthLabel } from '@/lib/utils/month';
import type { ActualDto, CategoryDto } from '@/lib/api/types';

export function ActualsTable({
  actuals,
  categories,
  lockedMonths,
  isLoading,
  onChanged,
}: {
  actuals: ActualDto[];
  categories: CategoryDto[];
  lockedMonths: string[];
  isLoading: boolean;
  onChanged: () => void | Promise<unknown>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const locked = new Set(lockedMonths);

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await api.del(`/api/actuals/${id}`);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the entry'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Table>
        <THead>
          <TR>
            <TH>Month</TH>
            <TH>Category</TH>
            <TH numeric>Amount</TH>
            <TH>Note</TH>
            <TH>Source</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {isLoading && <EmptyRow colSpan={6}>Loading actuals...</EmptyRow>}
          {!isLoading && actuals.length === 0 && (
            <EmptyRow colSpan={6}>No actuals logged in this range yet.</EmptyRow>
          )}
          {actuals.map((actual) => {
            const isLocked = locked.has(actual.month);
            return (
              <TR key={actual.id}>
                <TD>
                  {formatMonthLabel(actual.month)}
                  {isLocked && (
                    <Badge tone="danger" className="ml-2">
                      Locked
                    </Badge>
                  )}
                </TD>
                <TD className="font-medium text-slate-900">
                  {categoryNames.get(actual.categoryId) ?? 'Unknown category'}
                </TD>
                <TD numeric>{formatCurrency(actual.amount)}</TD>
                <TD className="max-w-xs truncate whitespace-normal text-slate-500">
                  {actual.note ?? ''}
                </TD>
                <TD>
                  <Badge tone={actual.source === 'csv_import' ? 'info' : 'neutral'}>
                    {actual.source === 'csv_import' ? 'CSV' : 'Manual'}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isLocked}
                    loading={deletingId === actual.id}
                    onClick={() => handleDelete(actual.id)}
                    title={isLocked ? 'This period is locked' : undefined}
                  >
                    Delete
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
