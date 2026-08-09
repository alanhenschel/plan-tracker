import type { ReportResponse } from '@/lib/report/types';

/** Response shapes returned by the route handlers, for typed SWR calls. */

export interface CategoryDto {
  id: string;
  name: string;
}

export interface PlanDto {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
}

export interface ActualDto {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
  note: string | null;
  source: 'manual' | 'csv_import';
  importBatchId: string | null;
  createdAt: string;
}

export interface LockDto {
  month: string;
  lockedAt: string;
}

export interface MeResponse {
  user: { id: string; email: string; name: string | null };
}

export interface CategoriesResponse {
  categories: CategoryDto[];
}

export interface PlansResponse {
  plans: PlanDto[];
}

export interface ActualsResponse {
  actuals: ActualDto[];
}

export interface LocksResponse {
  locks: LockDto[];
  lockedMonths: string[];
}

export interface ImportRowIssue {
  row: number;
  reason: string;
}

export interface ImportResponse {
  batchId: string | null;
  imported: number;
  skipped: number;
  skippedRows: ImportRowIssue[];
  errors: ImportRowIssue[];
  totalRows: number;
}

export type { ReportResponse };
