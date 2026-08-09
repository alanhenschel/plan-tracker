/**
 * Variance math.
 *
 * PURE MODULE — zero imports. This is the single place the two documented
 * edge-case policies live:
 *
 *   1. Plan = 0  → variance % is `null` (rendered "—"), never NaN or Infinity.
 *                  A percentage of nothing is undefined, and 0 → 100 spend is
 *                  not "infinitely over budget", it is "unbudgeted".
 *   2. Missing actual → the caller passes 0. This module never sees `undefined`;
 *                  defaulting happens in aggregate.ts so the policy is applied
 *                  in exactly one place.
 */

/** Actual − Plan. Negative = under plan (spent less than targeted). */
export function calcVariance(plan: number, actual: number): number {
  return actual - plan;
}

/**
 * (Actual − Plan) / Plan × 100.
 * Returns `null` when plan is 0 (or not finite) — see policy 1 above.
 */
export function calcVariancePct(plan: number, actual: number): number | null {
  if (!Number.isFinite(plan) || plan === 0) return null;
  const pct = ((actual - plan) / plan) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** Both figures at once — the shape every report row needs. */
export function calcVarianceFields(
  plan: number,
  actual: number,
): { variance: number; variancePct: number | null } {
  return {
    variance: calcVariance(plan, actual),
    variancePct: calcVariancePct(plan, actual),
  };
}

/**
 * Rounds to `dp` decimal places for display/comparison.
 * Uses an epsilon nudge so values like 2.675 round half-up rather than down
 * on the binary representation (2.67499...).
 */
export function roundTo(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON * Math.sign(value) * Math.abs(value)) * factor) / factor;
}
