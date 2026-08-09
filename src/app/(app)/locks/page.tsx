'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { LockToggle } from '@/components/locks/LockToggle';
import { useLocks } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/client';

export default function LocksPage() {
  const [from, setFrom] = useState('2026-01');
  const [to, setTo] = useState('2026-06');

  const locksQuery = useLocks(from, to);

  return (
    <>
      <PageHeader
        title="Locked periods"
        description="Locking a month makes its plans and actuals read-only. Enforcement is server-side: the API answers 423 Locked, so hiding the buttons is not what protects the data."
      />

      <Card>
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <MonthPicker label="From" value={from} onChange={setFrom} max={to} />
          <MonthPicker label="To" value={to} onChange={setTo} min={from} />
        </div>

        {locksQuery.error && (
          <Alert tone="error" className="mb-4">
            {errorMessage(locksQuery.error)}
          </Alert>
        )}

        <LockToggle
          from={from}
          to={to}
          lockedMonths={locksQuery.data?.lockedMonths ?? []}
          isLoading={locksQuery.isLoading}
          onChanged={() => locksQuery.mutate()}
        />
      </Card>
    </>
  );
}
