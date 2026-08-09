'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { ActualForm } from '@/components/actuals/ActualForm';
import { ActualsTable } from '@/components/actuals/ActualsTable';
import { CsvImportForm } from '@/components/actuals/CsvImportForm';
import { useActuals, useCategories, useLocks } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/client';
import { addMonths, currentMonth } from '@/lib/utils/month';

export default function ActualsPage() {
  const [from, setFrom] = useState(() => addMonths(currentMonth(), -5));
  const [to, setTo] = useState(() => currentMonth());

  const categoriesQuery = useCategories();
  const actualsQuery = useActuals(from, to);
  const locksQuery = useLocks(from, to);

  const loadError = categoriesQuery.error ?? actualsQuery.error ?? locksQuery.error;

  async function refresh() {
    await Promise.all([actualsQuery.mutate(), locksQuery.mutate()]);
  }

  return (
    <>
      <PageHeader
        title="Actuals"
        description="Logged spend. Entries are a ledger: several rows can share a category and month, and the report sums them."
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Log an actual" />
            <ActualForm
              categories={categoriesQuery.data?.categories ?? []}
              defaultMonth={to}
              onCreated={refresh}
            />
          </Card>

          <Card>
            <CardHeader
              title="Import CSV"
              description="Rows in locked periods are reported as skipped, not imported."
            />
            <CsvImportForm onImported={refresh} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end gap-4">
              <MonthPicker label="From" value={from} onChange={setFrom} max={to} />
              <MonthPicker label="To" value={to} onChange={setTo} min={from} />
            </div>
          </Card>

          {loadError && <Alert tone="error">{errorMessage(loadError)}</Alert>}

          <ActualsTable
            actuals={actualsQuery.data?.actuals ?? []}
            categories={categoriesQuery.data?.categories ?? []}
            lockedMonths={locksQuery.data?.lockedMonths ?? []}
            isLoading={actualsQuery.isLoading}
            onChanged={refresh}
          />
        </div>
      </div>
    </>
  );
}
