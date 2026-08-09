'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { api, errorMessage } from '@/lib/api/client';
import { formatCurrency } from '@/lib/utils/format';
import type { CategoryDto, PlanDto } from '@/lib/api/types';

/**
 * Category x amount grid for a single month.
 *
 * The inputs are disabled when the month is locked, but that is only a
 * convenience: `PUT /api/plans` performs the same check server-side and
 * answers 423, which this component surfaces if it ever happens.
 */
export function PlanGrid({
  month,
  categories,
  plans,
  isLocked,
  onSaved,
}: {
  month: string;
  categories: CategoryDto[];
  plans: PlanDto[];
  isLocked: boolean;
  onSaved: () => void | Promise<unknown>;
}) {
  const planByCategory = useMemo(() => {
    const map = new Map<string, PlanDto>();
    for (const plan of plans) {
      if (plan.month === month) map.set(plan.categoryId, plan);
    }
    return map;
  }, [plans, month]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Reset the local edit buffer whenever the month or the server data changes,
  // so a stale draft from another month never gets saved by accident.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const category of categories) {
      const plan = planByCategory.get(category.id);
      next[category.id] = plan ? String(plan.amount) : '';
    }
    setDrafts(next);
    setSavedId(null);
  }, [categories, planByCategory, month]);

  async function saveCategory(categoryId: string) {
    const raw = (drafts[categoryId] ?? '').trim();
    if (raw === '') {
      setError('Enter an amount before saving. Use 0 for an explicit zero target.');
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Amount must be a number of 0 or more.');
      return;
    }

    setError(null);
    setSavingId(categoryId);
    try {
      await api.put('/api/plans', { categoryId, month, amount });
      setSavedId(categoryId);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the target'));
    } finally {
      setSavingId(null);
    }
  }

  async function deletePlan(planId: string) {
    setError(null);
    setSavingId(planId);
    try {
      await api.del(`/api/plans/${planId}`);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the target'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}

      <Table>
        <THead>
          <TR>
            <TH>Category</TH>
            <TH numeric>Target amount</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {categories.length === 0 && (
            <EmptyRow colSpan={4}>Create a category before setting targets.</EmptyRow>
          )}
          {categories.map((category) => {
            const plan = planByCategory.get(category.id);
            const busy = savingId === category.id || savingId === plan?.id;
            return (
              <TR key={category.id}>
                <TD className="font-medium text-slate-900">{category.name}</TD>
                <TD numeric>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    disabled={isLocked}
                    aria-label={`Target for ${category.name} in ${month}`}
                    value={drafts[category.id] ?? ''}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [category.id]: e.target.value }))
                    }
                    className="tabular w-36 rounded-md border-0 bg-white px-2 py-1 text-right text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                    placeholder="0"
                  />
                </TD>
                <TD>
                  {plan ? (
                    <span className="text-xs text-slate-500">
                      Saved {formatCurrency(plan.amount)}
                    </span>
                  ) : (
                    <Badge tone="warning">No target</Badge>
                  )}
                  {savedId === category.id && (
                    <span className="ml-2 text-xs text-emerald-600">Updated</span>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={isLocked}
                      loading={busy && savingId === category.id}
                      onClick={() => saveCategory(category.id)}
                    >
                      Save
                    </Button>
                    {plan && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isLocked}
                        loading={busy && savingId === plan.id}
                        onClick={() => deletePlan(plan.id)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
