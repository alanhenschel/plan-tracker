'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { PlanGrid } from '@/components/plans/PlanGrid';
import { useCategories, useLocks, usePlans } from '@/lib/api/hooks';
import { errorMessage } from '@/lib/api/client';
import { currentMonth, formatMonthLabel } from '@/lib/utils/month';

export default function PlansPage() {
  const [month, setMonth] = useState(() => currentMonth());

  const categoriesQuery = useCategories();
  // Single-month range: from and to are the same month.
  const plansQuery = usePlans(month, month);
  const locksQuery = useLocks(month, month);

  const isLocked = (locksQuery.data?.lockedMonths ?? []).includes(month);
  const loadError = categoriesQuery.error ?? plansQuery.error ?? locksQuery.error;

  return (
    <>
      <PageHeader
        title="Plans"
        description="Set the monthly target for each category. Targets in locked periods are read-only."
      />

      <Card>
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <MonthPicker label="Month" value={month} onChange={setMonth} />
          <div className="pb-1">
            {isLocked ? (
              <Badge tone="danger">{formatMonthLabel(month)} is locked</Badge>
            ) : (
              <Badge tone="success">{formatMonthLabel(month)} is open</Badge>
            )}
          </div>
        </div>

        {loadError && (
          <Alert tone="error" className="mb-4">
            {errorMessage(loadError)}
          </Alert>
        )}

        {isLocked && (
          <Alert tone="warning" className="mb-4">
            This period is locked. Unlock it on the Locks page to edit targets. The API
            rejects writes to locked periods with HTTP 423 even if you bypass this UI.
          </Alert>
        )}

        <PlanGrid
          month={month}
          categories={categoriesQuery.data?.categories ?? []}
          plans={plansQuery.data?.plans ?? []}
          isLocked={isLocked}
          onSaved={() => plansQuery.mutate()}
        />
      </Card>
    </>
  );
}
