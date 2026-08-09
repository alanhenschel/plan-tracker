'use client';

import useSWR from 'swr';
import { fetcher } from './client';
import type {
  ActualsResponse,
  CategoriesResponse,
  LocksResponse,
  PlansResponse,
  ReportResponse,
} from './types';

/**
 * SWR wrappers. Keys are the request URLs, so `mutate(url)` after a write
 * revalidates exactly the affected query and nothing else.
 */

export function useCategories() {
  return useSWR<CategoriesResponse>('/api/categories', fetcher);
}

export function usePlans(from: string, to: string) {
  return useSWR<PlansResponse>(`/api/plans?from=${from}&to=${to}`, fetcher);
}

export function useActuals(from: string | null, to: string | null, categoryId?: string) {
  let key: string | null = null;
  if (from && to) {
    const query = new URLSearchParams({ from, to });
    if (categoryId) query.set('categoryId', categoryId);
    key = `/api/actuals?${query.toString()}`;
  }
  return useSWR<ActualsResponse>(key, fetcher);
}

export function useLocks(from: string, to: string) {
  return useSWR<LocksResponse>(`/api/locks?from=${from}&to=${to}`, fetcher);
}

export function useReport(from: string, to: string, categoryId?: string) {
  const query = new URLSearchParams({ from, to });
  if (categoryId) query.set('categoryId', categoryId);
  return useSWR<ReportResponse>(`/api/report?${query.toString()}`, fetcher);
}

/** Report URLs, shared by the report page and its CSV export link. */
export function reportUrls(from: string, to: string, categoryId?: string) {
  const query = new URLSearchParams({ from, to });
  if (categoryId) query.set('categoryId', categoryId);
  return {
    json: `/api/report?${query.toString()}`,
    csv: `/api/report/export?${query.toString()}`,
  };
}
