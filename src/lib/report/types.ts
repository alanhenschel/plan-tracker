/**
 * Shapes shared by the report aggregation layer and its HTTP callers.
 *
 * PURE MODULE — no mongoose, no next, no I/O. The aggregation input types are
 * deliberately plain (`categoryId` is a `string`, not an `ObjectId`) so the
 * route handler maps documents into them and the math stays unit-testable
 * without a database.
 */

export interface PlanInput {
  categoryId: string;
  month: string; // YYYY-MM
  amount: number;
}

export interface ActualInput {
  categoryId: string;
  month: string; // YYYY-MM
  amount: number;
}

export interface CategoryInput {
  id: string;
  name: string;
}

export interface ReportRange {
  from: string; // YYYY-MM inclusive
  to: string; // YYYY-MM inclusive
}

export interface ReportRow {
  categoryId: string;
  categoryName: string;
  month: string;
  plan: number;
  actual: number;
  variance: number;
  /** `null` when plan === 0 — the UI renders this as "—", never NaN. */
  variancePct: number | null;
  isLocked: boolean;
  /** False when no Plan document exists for this cell (plan defaulted to 0). */
  hasPlan: boolean;
  /** False when no Actual documents exist for this cell (actual defaulted to 0). */
  hasActual: boolean;
}

export interface MonthlyNetVariance {
  month: string;
  netVariance: number;
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  totalPlan: number;
  totalActual: number;
  totalVariance: number;
}

export interface ReportResponse {
  range: ReportRange;
  rows: ReportRow[];
  monthlyNetVariance: MonthlyNetVariance[];
  categoryTotals: CategoryTotal[];
}

export interface AggregateOptions {
  /** Months that are locked for this user. Drives `ReportRow.isLocked`. */
  lockedMonths?: Iterable<string>;
  /** Restrict output to a single category (report `?categoryId=` filter). */
  categoryId?: string;
}
