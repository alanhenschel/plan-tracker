/**
 * Seeds the demo dataset from the assignment spec and then verifies it.
 *
 *   npm run seed
 *
 * The script is idempotent: it wipes the demo user's categories, plans, actuals
 * and locks before re-inserting, so running it twice produces the same state.
 *
 * The important part is the SELF-CHECK at the end. It runs the real
 * `aggregateReport` over the seeded data and asserts the output matches the
 * spec's sample table cell for cell. If the seed data or the aggregation logic
 * ever drifts apart, this fails loudly with a non-zero exit code rather than
 * leaving a demo environment that quietly shows the wrong numbers.
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';

// Load .env.local first (developer machine), then .env as a fallback.
// `override: false` is the default, so the first file to define a key wins.
const ROOT = path.resolve(__dirname, '..');
loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db/connect';
import { User } from '../src/lib/db/models/User';
import { Category } from '../src/lib/db/models/Category';
import { Plan } from '../src/lib/db/models/Plan';
import { Actual } from '../src/lib/db/models/Actual';
import { Lock } from '../src/lib/db/models/Lock';
import { hashPassword } from '../src/lib/auth/password';
import { aggregateReport } from '../src/lib/report/aggregate';
import type { ReportRow } from '../src/lib/report/types';

const DEMO_EMAIL = 'demo@crossval.test';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_NAME = 'Demo User';

const CATEGORY_NAMES = ['Marketing', 'Payroll', 'Tools'] as const;

/** Targets, from the spec's sample table. */
const PLANS: { category: string; month: string; amount: number }[] = [
  { category: 'Marketing', month: '2026-01', amount: 5000 },
  { category: 'Payroll', month: '2026-01', amount: 20000 },
  { category: 'Marketing', month: '2026-02', amount: 5000 },
  { category: 'Payroll', month: '2026-02', amount: 20000 },
];

/**
 * Actuals, matching the spec's CSV exactly.
 * 2026-02 Marketing is INTENTIONALLY absent - it is the "missing actual" case
 * the report must render as 0 / -5,000 / -100.00%.
 */
const ACTUALS: { category: string; month: string; amount: number; note: string }[] = [
  { category: 'Marketing', month: '2026-01', amount: 4800, note: 'Q1 campaign spend' },
  { category: 'Payroll', month: '2026-01', amount: 20500, note: 'January payroll run' },
  { category: 'Payroll', month: '2026-02', amount: 19800, note: 'February payroll run' },
];

/** The expected report, transcribed from the sample table in context.md. */
const EXPECTED_ROWS: {
  month: string;
  categoryName: string;
  plan: number;
  actual: number;
  variance: number;
  variancePct: number | null;
}[] = [
  { month: '2026-01', categoryName: 'Marketing', plan: 5000, actual: 4800, variance: -200, variancePct: -4 },
  { month: '2026-01', categoryName: 'Payroll', plan: 20000, actual: 20500, variance: 500, variancePct: 2.5 },
  { month: '2026-02', categoryName: 'Marketing', plan: 5000, actual: 0, variance: -5000, variancePct: -100 },
  { month: '2026-02', categoryName: 'Payroll', plan: 20000, actual: 19800, variance: -200, variancePct: -1 },
];

const EXPECTED_MONTHLY_NET = [
  { month: '2026-01', netVariance: 300 },
  { month: '2026-02', netVariance: -5200 },
];

const EXPECTED_CATEGORY_TOTALS = [
  { categoryName: 'Marketing', totalPlan: 10000, totalActual: 4800, totalVariance: -5200 },
  { categoryName: 'Payroll', totalPlan: 40000, totalActual: 40300, totalVariance: 300 },
];

const SAMPLE_CSV = [
  'month,category,amount',
  '2026-01,Marketing,4800',
  '2026-01,Payroll,20500',
  '2026-02,Payroll,19800',
  '',
].join('\n');

const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures.push(`${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

async function seed(): Promise<void> {
  console.log('> connecting to MongoDB...');
  await connectToDatabase();
  console.log(`  connected to ${mongoose.connection.name}`);

  // ---------------------------------------------------------------- user
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user = await User.findOneAndUpdate(
    { email: DEMO_EMAIL },
    { $set: { passwordHash, name: DEMO_NAME } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`> demo user ${DEMO_EMAIL} (${user._id.toString()})`);

  // Reset this user's data only - never touch other accounts in the database.
  const scope = { userId: user._id };
  await Promise.all([
    Category.deleteMany(scope),
    Plan.deleteMany(scope),
    Actual.deleteMany(scope),
    Lock.deleteMany(scope),
  ]);
  console.log('> cleared previous demo data');

  // ---------------------------------------------------------- categories
  const categories = await Category.insertMany(
    CATEGORY_NAMES.map((name) => ({ userId: user._id, name })),
  );
  // Explicit key type: CATEGORY_NAMES is `as const`, so an inferred Map key
  // would be the literal union and reject the plain `string` lookups below.
  const categoryIdByName = new Map<string, mongoose.Types.ObjectId>(
    categories.map((c) => [c.name, c._id]),
  );
  console.log(`> inserted ${categories.length} categories: ${CATEGORY_NAMES.join(', ')}`);

  // --------------------------------------------------------------- plans
  const planDocs = PLANS.map((plan) => ({
    userId: user._id,
    categoryId: categoryIdByName.get(plan.category)!,
    month: plan.month,
    amount: plan.amount,
  }));
  await Plan.insertMany(planDocs);
  console.log(`> inserted ${planDocs.length} plans`);

  // ------------------------------------------------------------- actuals
  const actualDocs = ACTUALS.map((actual) => ({
    userId: user._id,
    categoryId: categoryIdByName.get(actual.category)!,
    month: actual.month,
    amount: actual.amount,
    note: actual.note,
    source: 'manual' as const,
  }));
  await Actual.insertMany(actualDocs);
  console.log(`> inserted ${actualDocs.length} actuals (2026-02 Marketing omitted on purpose)`);

  // ----------------------------------------------------------- sample CSV
  const csvPath = path.join(ROOT, 'scripts', 'sample-actuals.csv');
  writeFileSync(csvPath, SAMPLE_CSV, 'utf8');
  console.log(`> wrote ${path.relative(ROOT, csvPath)}`);

  // ------------------------------------------------------------ SELF-CHECK
  console.log('\n> self-check: re-aggregating seeded data and comparing to the spec table');

  const [plans, actuals, cats] = await Promise.all([
    Plan.find(scope).select('categoryId month amount').lean(),
    Actual.find(scope).select('categoryId month amount').lean(),
    Category.find(scope).select('_id name').lean(),
  ]);

  const report = aggregateReport(
    plans.map((p) => ({ categoryId: p.categoryId.toString(), month: p.month, amount: p.amount })),
    actuals.map((a) => ({ categoryId: a.categoryId.toString(), month: a.month, amount: a.amount })),
    cats.map((c) => ({ id: c._id.toString(), name: c.name })),
    { from: '2026-01', to: '2026-02' },
  );

  check(
    'row count',
    report.rows.length,
    EXPECTED_ROWS.length,
  );

  const compact = (row: ReportRow) => ({
    month: row.month,
    categoryName: row.categoryName,
    plan: row.plan,
    actual: row.actual,
    variance: row.variance,
    variancePct: row.variancePct,
  });

  check('report rows', report.rows.map(compact), EXPECTED_ROWS);
  check('monthly net variance', report.monthlyNetVariance, EXPECTED_MONTHLY_NET);
  check(
    'category totals',
    report.categoryTotals.map((t) => ({
      categoryName: t.categoryName,
      totalPlan: t.totalPlan,
      totalActual: t.totalActual,
      totalVariance: t.totalVariance,
    })),
    EXPECTED_CATEGORY_TOTALS,
  );

  printTable(report.rows);

  if (failures.length > 0) {
    console.error(`\nSELF-CHECK FAILED (${failures.length} mismatch(es)):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    throw new Error('Seeded data does not match the assignment sample table');
  }

  console.log('\nSELF-CHECK PASSED - aggregated output matches the sample table exactly.');
  console.log(`\nSign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

function printTable(rows: ReportRow[]): void {
  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}%`);
  const pad = (s: string, n: number) => s.padStart(n);

  console.log('');
  console.log('  Month    Category    Plan      Actual    Variance  Variance %');
  console.log('  -------  ----------  --------  --------  --------  ----------');
  for (const row of rows) {
    console.log(
      `  ${row.month}  ${row.categoryName.padEnd(10)}  ${pad(String(row.plan), 8)}  ` +
        `${pad(String(row.actual), 8)}  ${pad(String(row.variance), 8)}  ${pad(pct(row.variancePct), 10)}`,
    );
  }
}

seed()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nSeed failed:', err instanceof Error ? err.message : err);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });
