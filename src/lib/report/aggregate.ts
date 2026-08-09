import { calcVariance, calcVariancePct, roundTo } from './variance';
import { monthsInRange } from '@/lib/utils/month';
import type {
  ActualInput,
  AggregateOptions,
  CategoryInput,
  CategoryTotal,
  MonthlyNetVariance,
  PlanInput,
  ReportRange,
  ReportResponse,
  ReportRow,
} from './types';

/**
 * Report aggregation.
 *
 * PURE MODULE - imports only sibling pure modules (`variance`, `utils/month`).
 * No mongoose, no next, no I/O. The route handler loads documents and maps them
 * into the plain inputs below; all reporting math lives here so it can be
 * unit-tested against the spec's sample table without a database.
 *
 * Policies applied here (documented in the README):
 *   - A row exists for every (category x month) key present in plans union
 *     actuals inside the range. We do NOT emit a full category x month
 *     cross-product: a category with neither a target nor spend in a month is
 *     not a fact worth a row, and padding would bury real data in a zero grid.
 *   - Multiple Actual documents for the same key are SUMMED (ledger semantics).
 *   - Missing actual -> 0, so variance is -plan and variance % is -100%.
 *   - Missing plan   -> 0, so variance % is null (rendered as an em dash).
 */

interface CellKeyParts {
  categoryId: string;
  month: string;
}

/**
 * Composite map key for a (category, month) cell. The key is never parsed back
 * apart - `keyParts` below remembers the components - so a category id
 * containing the separator character cannot corrupt a row.
 */
function makeKey(categoryId: string, month: string): string {
  return `${categoryId}|${month}`;
}

function inRange(month: string, range: ReportRange): boolean {
  // Lexicographic comparison is chronological for YYYY-MM.
  return month >= range.from && month <= range.to;
}

export function aggregateReport(
  plans: readonly PlanInput[],
  actuals: readonly ActualInput[],
  categories: readonly CategoryInput[],
  range: ReportRange,
  options: AggregateOptions = {},
): ReportResponse {
  const lockedMonths = new Set(options.lockedMonths ?? []);
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const categoryFilter = options.categoryId;

  const keep = (categoryId: string, month: string): boolean =>
    inRange(month, range) && (categoryFilter === undefined || categoryFilter === categoryId);

  const keyParts = new Map<string, CellKeyParts>();
  const rememberKey = (categoryId: string, month: string): string => {
    const key = makeKey(categoryId, month);
    if (!keyParts.has(key)) keyParts.set(key, { categoryId, month });
    return key;
  };

  // planByKey: last write wins. The unique index on
  // {userId, categoryId, month} means duplicates cannot exist in practice.
  const planByKey = new Map<string, number>();
  for (const plan of plans) {
    if (!keep(plan.categoryId, plan.month)) continue;
    planByKey.set(rememberKey(plan.categoryId, plan.month), plan.amount);
  }

  // actualByKey: SUMMED, because actuals are a ledger of individual entries.
  const actualByKey = new Map<string, number>();
  for (const actual of actuals) {
    if (!keep(actual.categoryId, actual.month)) continue;
    const key = rememberKey(actual.categoryId, actual.month);
    actualByKey.set(key, (actualByKey.get(key) ?? 0) + actual.amount);
  }

  const rows: ReportRow[] = [];
  for (const [key, parts] of keyParts) {
    const hasPlan = planByKey.has(key);
    const hasActual = actualByKey.has(key);
    const plan = roundTo(planByKey.get(key) ?? 0);
    const actual = roundTo(actualByKey.get(key) ?? 0);
    const variancePct = calcVariancePct(plan, actual);

    rows.push({
      categoryId: parts.categoryId,
      month: parts.month,
      // Categories are create-only, so an unresolvable id means the caller
      // passed an incomplete category list. Surface it rather than drop the row.
      categoryName: categoryNames.get(parts.categoryId) ?? 'Unknown category',
      plan,
      actual,
      variance: roundTo(calcVariance(plan, actual)),
      variancePct: variancePct === null ? null : roundTo(variancePct),
      isLocked: lockedMonths.has(parts.month),
      hasPlan,
      hasActual,
    });
  }

  rows.sort(compareRows);

  return {
    range,
    rows,
    monthlyNetVariance: computeMonthlyNetVariance(rows, range),
    categoryTotals: computeCategoryTotals(rows),
  };
}

/** Month ascending, then category name, then category id as a stable tiebreak. */
function compareRows(a: ReportRow, b: ReportRow): number {
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.categoryName !== b.categoryName) return a.categoryName < b.categoryName ? -1 : 1;
  if (a.categoryId === b.categoryId) return 0;
  return a.categoryId < b.categoryId ? -1 : 1;
}

/**
 * Net variance per month across all categories.
 *
 * Emits an entry for EVERY month in the range, including months with no data
 * (netVariance 0), so the chart draws a continuous axis instead of silently
 * collapsing empty months.
 */
export function computeMonthlyNetVariance(
  rows: readonly ReportRow[],
  range: ReportRange,
): MonthlyNetVariance[] {
  const totals = new Map<string, number>();
  for (const month of monthsInRange(range.from, range.to)) {
    totals.set(month, 0);
  }
  for (const row of rows) {
    // `?? 0` guards against a row outside the range being passed in directly.
    totals.set(row.month, (totals.get(row.month) ?? 0) + row.variance);
  }

  return [...totals.entries()]
    .map(([month, netVariance]) => ({ month, netVariance: roundTo(netVariance) }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** Plan/actual/variance totals per category over the whole range. */
export function computeCategoryTotals(rows: readonly ReportRow[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();

  for (const row of rows) {
    const existing = totals.get(row.categoryId);
    if (existing) {
      existing.totalPlan += row.plan;
      existing.totalActual += row.actual;
      existing.totalVariance += row.variance;
    } else {
      totals.set(row.categoryId, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        totalPlan: row.plan,
        totalActual: row.actual,
        totalVariance: row.variance,
      });
    }
  }

  return [...totals.values()]
    .map((t) => ({
      ...t,
      totalPlan: roundTo(t.totalPlan),
      totalActual: roundTo(t.totalActual),
      totalVariance: roundTo(t.totalVariance),
    }))
    .sort((a, b) =>
      a.categoryName < b.categoryName ? -1 : a.categoryName > b.categoryName ? 1 : 0,
    );
}
