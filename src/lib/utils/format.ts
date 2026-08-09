/**
 * Display formatting. PURE MODULE - no imports.
 *
 * The em dash returned for a null variance % is the documented rendering of
 * the "plan = 0" policy: the ratio is undefined, so we show nothing rather
 * than a fabricated 0% or a NaN.
 */

export const EM_DASH = '—';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return currencyFormatter.format(value);
}

/** Currency with an explicit sign - used for variance columns. */
export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  if (value === 0) return currencyFormatter.format(0);
  const sign = value > 0 ? '+' : '-';
  return `${sign}${currencyFormatter.format(Math.abs(value))}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return numberFormatter.format(value);
}

/** `null` -> em dash. This is the plan = 0 rendering. */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return EM_DASH;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Text colour for a variance figure, from the same validated palette the chart
 * uses: over plan is the warm pole, under plan the success ink. The sign is
 * always printed alongside, so colour is never the only encoding.
 */
export function varianceToneClass(value: number): string {
  if (value > 0) return 'text-ink-bad';
  if (value < 0) return 'text-ink-good';
  return 'text-slate-500';
}
