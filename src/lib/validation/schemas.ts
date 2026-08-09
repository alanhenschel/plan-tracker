import { z } from 'zod';
import { MONTH_REGEX } from '@/lib/utils/month';

/**
 * Every request body / query string that reaches a route handler is parsed
 * through one of these. Nothing untrusted is passed to Mongo unvalidated.
 */

export const monthSchema = z
  .string()
  .regex(MONTH_REGEX, 'Month must be in YYYY-MM format (e.g. 2026-01)');

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

/**
 * Money amounts. Rejects NaN/Infinity (zod's `.finite()`), negatives, and
 * absurd magnitudes that would lose precision as IEEE doubles.
 */
export const amountSchema = z
  .number()
  .finite('Amount must be a number')
  .min(0, 'Amount cannot be negative')
  .max(1_000_000_000_000, 'Amount is unrealistically large');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);

/**
 * 8 char minimum. Deliberately not enforcing character-class rules: length is
 * the property that actually resists cracking, and complexity rules push users
 * toward predictable substitutions.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password must be at most 200 characters');

// ---------------------------------------------------------------- auth

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------- categories

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(64),
});

// --------------------------------------------------------------- plans

export const upsertPlanSchema = z.object({
  categoryId: objectIdSchema,
  month: monthSchema,
  amount: amountSchema,
});

// ------------------------------------------------------------- actuals

export const createActualSchema = z.object({
  categoryId: objectIdSchema,
  month: monthSchema,
  amount: amountSchema,
  note: z.string().trim().max(500).optional(),
});

/**
 * PUT /api/actuals/[id] - partial update. `.partial()` plus a non-empty check
 * so an empty body is a 400 rather than a silent no-op write.
 */
export const updateActualSchema = createActualSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

// --------------------------------------------------------------- locks

export const createLockSchema = z.object({
  month: monthSchema,
});

// -------------------------------------------------------- query params

/**
 * Shared `?from=&to=` range. Applied to plans, actuals, locks and report.
 * Rejects inverted ranges up front so handlers never have to.
 */
export const rangeQuerySchema = z
  .object({
    from: monthSchema,
    to: monthSchema,
  })
  .refine((v) => v.from <= v.to, {
    message: '`from` must be less than or equal to `to`',
    path: ['from'],
  });

export const reportQuerySchema = z
  .object({
    from: monthSchema,
    to: monthSchema,
    categoryId: objectIdSchema.optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: '`from` must be less than or equal to `to`',
    path: ['from'],
  });

export const actualsQuerySchema = reportQuerySchema;

/** Reads a URL's search params into a plain object for zod. */
export function searchParamsToObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;
export type CreateActualInput = z.infer<typeof createActualSchema>;
export type UpdateActualInput = z.infer<typeof updateActualSchema>;
