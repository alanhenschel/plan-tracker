import { describe, expect, it } from 'vitest';
import {
  calcVariance,
  calcVarianceFields,
  calcVariancePct,
  roundTo,
} from '@/lib/report/variance';

/**
 * The four rows of the spec's sample table, used as the primary fixture in
 * both this file and aggregate.test.ts.
 */
const SAMPLE_TABLE = [
  { label: '2026-01 Marketing', plan: 5000, actual: 4800, variance: -200, pct: -4 },
  { label: '2026-01 Payroll', plan: 20000, actual: 20500, variance: 500, pct: 2.5 },
  { label: '2026-02 Marketing (missing actual -> 0)', plan: 5000, actual: 0, variance: -5000, pct: -100 },
  { label: '2026-02 Payroll', plan: 20000, actual: 19800, variance: -200, pct: -1 },
] as const;

describe('calcVariance', () => {
  it.each(SAMPLE_TABLE)('$label -> variance $variance', ({ plan, actual, variance }) => {
    expect(calcVariance(plan, actual)).toBe(variance);
  });

  it('is positive when actual exceeds plan (over budget)', () => {
    expect(calcVariance(100, 150)).toBe(50);
  });

  it('is negative when actual is under plan', () => {
    expect(calcVariance(100, 60)).toBe(-40);
  });

  it('is zero when plan and actual match exactly', () => {
    expect(calcVariance(1234.56, 1234.56)).toBe(0);
  });

  it('handles a zero plan with real spend', () => {
    expect(calcVariance(0, 900)).toBe(900);
  });
});

describe('calcVariancePct', () => {
  it.each(SAMPLE_TABLE)('$label -> $pct%', ({ plan, actual, pct }) => {
    expect(calcVariancePct(plan, actual)).toBeCloseTo(pct, 10);
  });

  // The documented plan = 0 policy.
  it('returns null when plan is 0 and there is spend', () => {
    expect(calcVariancePct(0, 500)).toBeNull();
  });

  it('returns null when plan is 0 and there is no spend', () => {
    expect(calcVariancePct(0, 0)).toBeNull();
  });

  it('returns null rather than -0 artefacts for a negative zero plan', () => {
    expect(calcVariancePct(-0, 100)).toBeNull();
  });

  it('never returns NaN or Infinity for a zero plan', () => {
    const result = calcVariancePct(0, 12345);
    expect(result).toBeNull();
    expect(Number.isNaN(result as unknown as number)).toBe(false);
  });

  it('returns null for a non-finite plan instead of propagating NaN', () => {
    expect(calcVariancePct(Number.NaN, 100)).toBeNull();
    expect(calcVariancePct(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  it('is exactly -100% when the plan exists and nothing was spent', () => {
    expect(calcVariancePct(5000, 0)).toBe(-100);
  });

  it('is 0% when actual equals plan', () => {
    expect(calcVariancePct(20000, 20000)).toBe(0);
  });
});

describe('calcVarianceFields', () => {
  it('returns both figures for a normal row', () => {
    expect(calcVarianceFields(5000, 4800)).toEqual({ variance: -200, variancePct: -4 });
  });

  it('returns a null percentage for a zero plan', () => {
    expect(calcVarianceFields(0, 250)).toEqual({ variance: 250, variancePct: null });
  });
});

describe('roundTo', () => {
  it('rounds to two decimal places by default', () => {
    expect(roundTo(1.005)).toBe(1.01);
    expect(roundTo(2.344)).toBe(2.34);
    expect(roundTo(2.345)).toBe(2.35);
  });

  it('cleans up floating point sums', () => {
    expect(roundTo(0.1 + 0.2)).toBe(0.3);
  });

  it('leaves integers untouched', () => {
    expect(roundTo(20000)).toBe(20000);
  });

  it('handles negatives symmetrically', () => {
    expect(roundTo(-4.005)).toBe(-4.01);
  });

  it('passes non-finite values through rather than producing NaN maths', () => {
    expect(roundTo(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});
