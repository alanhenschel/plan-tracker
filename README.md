# Plan vs Actual Tracker

A small budgeting app where a user sets **monthly spending targets** per category, logs
**actual spend** (manually or via CSV import), and views a **plan vs actual variance report**
over a date range — with **server-enforced period locking** so closed months cannot be edited.

Built as a take-home for CrossVal (Full Stack Developer). Next.js 14 App Router + TypeScript +
MongoDB (Mongoose 8), single codebase for API and UI.

**Live URL:** _(pending deployment — see [Deployment](#deployment) below)_

---

## Table of contents

- [Quick start](#quick-start)
- [Documented product rules](#documented-product-rules) — the four things the brief asks to be explicit about
  - [Variance % when plan is zero](#1-variance--when-plan-is-zero)
  - [How missing actuals are displayed](#2-how-missing-actuals-are-displayed)
  - [Locking behaviour and granularity](#3-locking-behaviour-and-granularity)
  - [CSV import semantics](#4-csv-import-semantics)
- [Tech stack and why](#tech-stack-and-why)
- [Data model](#data-model)
- [API surface](#api-surface)
- [Performance and indexing at scale](#performance-and-indexing-at-scale)
- [Testing](#testing)
- [Assumptions and tradeoffs](#assumptions-and-tradeoffs)
- [What I would improve before production](#what-i-would-improve-before-production)
- [Deployment](#deployment)
- [Stretch goals](#stretch-goals)
- [Troubleshooting](#troubleshooting)

---

## Quick start

### Prerequisites

| Requirement | Version used | Notes |
|---|---|---|
| Node.js | **18.19.1** (dev box) | `package.json` requires `>=18.17.0`. Node 20.x also works and is what Vercel defaults to. |
| npm | 9+ | ships with Node 18/20 |
| Docker | any recent | only needed to run MongoDB locally |
| MongoDB | 7.x | via Docker Compose, or point `MONGODB_URI` at any Mongo 6/7 instance (Atlas included) |

No `.nvmrc` is committed — the app is version-agnostic across Node 18/20.

### Steps

```bash
# 1. Start MongoDB (docker-compose.yml runs mongo:7 on :27017 with a named volume)
npm run docker:up
#    …or, if the Docker Compose plugin is not installed (see Troubleshooting):
#    docker run -d --name crossval-mongo -p 27017:27017 mongo:7

# 2. Install dependencies
npm install

# 3. Create your env file and generate a real signing secret
cp .env.example .env.local
openssl rand -hex 32          # paste the output as AUTH_SECRET in .env.local

# 4. Seed the demo user + the assignment's exact sample data
npm run seed

# 5. Run
npm run dev                   # http://localhost:3000
```

**Demo login:** `demo@crossval.test` / `Demo1234!`

Or click **Sign up** — every new account is automatically given three starter categories
(Marketing, Payroll, Tools) so the app is usable immediately.

### Environment variables (`.env.local`)

| Variable | Required | Example |
|---|---|---|
| `MONGODB_URI` | yes | `mongodb://localhost:27017/crossval` |
| `AUTH_SECRET` | yes | 32-byte hex from `openssl rand -hex 32`. The JWT signer **fails closed** on a missing or too-short secret. |
| `NODE_ENV` | no | `development` locally, `production` on Vercel |

### Verify the install

```bash
npm run test     # 184 tests (144 unit + 40 integration on an in-memory MongoDB)
npm run build    # production build, 24 routes, zero TypeScript errors
npm run seed     # prints "SELF-CHECK PASSED" — see below
```

`npm run seed` is idempotent and ends with a **self-check**: it feeds the seeded documents through
the real `aggregateReport` function and asserts the output equals the assignment's sample table
cell-for-cell, failing loudly if it does not. Seeding and the report can therefore never silently
drift apart.

---

## Documented product rules

These are the four edge-case policies the brief asks to be explicit about. Each one is
implemented in exactly one place and covered by tests.

### 1. Variance % when plan is zero

```
variance      = actual − plan                    (negative = under plan)
variance %    = plan === 0 ? null                (undefined — a % of nothing has no meaning)
                           : (actual − plan) / plan × 100
```

- When `plan === 0`, the API returns `variancePct: null` — **never** `NaN`, `Infinity`, or `0`.
- The UI renders `null` as an em dash **—**, with a tooltip reading *"Plan is 0, so the percentage
  is undefined"*.
- The absolute `variance` figure is still computed and shown (`actual − 0 = actual`), because that
  number is meaningful: it is unbudgeted spend.
- Non-finite inputs are also mapped to `null` as a defensive second gate.

Rationale: spending 5,000 against a 0 target is not "infinitely over budget", it is *unbudgeted*.
A number that pretends to be a percentage would be worse than an honest dash.

Source: [`src/lib/report/variance.ts`](src/lib/report/variance.ts) (a pure module with **zero
imports**). Covered by `tests/unit/variance.test.ts`.

### 2. How missing actuals are displayed

**Policy: a missing actual is treated as `0` in all arithmetic — consistently, everywhere — but the
UI labels it so a defaulted zero is never confused with a logged zero.**

- The report row carries a boolean `hasActual`. When it is `false`, the Actual cell renders
  `0.00 (no entries)` in muted text, with the tooltip *"No entries logged — treated as 0"*.
- The same applies to plans: `hasPlan: false` renders `0.00 (no target)`.
- The math never branches on these flags. They are presentation metadata only, so the API numbers
  and the UI numbers can never disagree.

This is the option the brief calls out as producing −5,000 / −100% for Marketing in 2026-02. The
policy reproduces the sample table exactly:

| Month | Category | Plan | Actual | Variance | Variance % | Notes |
|---|---|---|---:|---:|---:|---|
| 2026-01 | Marketing | 5,000 | 4,800 | **−200** | **−4.00%** | |
| 2026-01 | Payroll | 20,000 | 20,500 | **+500** | **+2.50%** | |
| 2026-02 | Marketing | 5,000 | 0 *(no entries)* | **−5,000** | **−100.00%** | missing actual → 0 |
| 2026-02 | Payroll | 20,000 | 19,800 | **−200** | **−1.00%** | |

Verified three ways: the `npm run seed` self-check, `tests/unit/aggregate.test.ts`, and
`tests/integration/report.test.ts` (which seeds the data through the real HTTP route handlers
against a live in-memory MongoDB and asserts the response body cell-for-cell).

Two related aggregation rules, for completeness:

- **Rows are the union of (category × month) keys present in plans *or* actuals** within the range
  — not a full cross-product. "Tools" has neither a target nor spend in Q1 2026, so it produces no
  rows rather than a wall of zeroes.
- **The chart is the exception.** `monthlyNetVariance` emits an entry for *every* month in the
  range (0 for empty months) so the x-axis stays continuous. Table rows are facts; chart points
  are a time axis.
- Money and percentages are rounded to 2 dp inside the aggregator using an epsilon-nudged
  `roundTo`, so `0.1 + 0.2` sums to `0.3` rather than `0.30000000000000004`.

Source: [`src/lib/report/aggregate.ts`](src/lib/report/aggregate.ts),
[`src/components/report/ReportTable.tsx`](src/components/report/ReportTable.tsx).

### 3. Locking behaviour and granularity

**Granularity: month.**

- A `Lock` document is `{ userId, month }`. Its **existence** means the month is closed — there is
  no `isLocked` boolean, so the ambiguous "row exists but false" state cannot occur. Unlocking is a
  delete, which leaves the collection as a clean set of currently-closed periods.
- `month` is already the atomic unit of `Plan.month` and `Actual.month`, so month-level locking
  needs no second abstraction. Quarter-level locking would introduce one — and it would break the
  moment fiscal quarters (which do not align with calendar quarters) are introduced.
- The `/locks` page has a **"Lock Quarter"** convenience button. It issues **three individual
  month locks**. The UX exists; a second locking model does not.

**Enforcement is server-side, not a hidden button.** Every mutating plan/actual route calls
`assertMonthUnlocked` before writing and returns **HTTP 423 Locked** with
`{"error":"Period 2026-01 is locked. Unlock it before editing plans or actuals."}`.

```bash
# with 2026-01 locked
curl -X PUT http://localhost:3000/api/plans -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"categoryId":"…","month":"2026-01","amount":9999}'
# → 423 {"error":"Period 2026-01 is locked. Unlock it before editing plans or actuals."}
```

Routes covered: `PUT /api/plans`, `DELETE /api/plans/[id]`, `POST /api/actuals`,
`PUT /api/actuals/[id]`, `DELETE /api/actuals/[id]`, `POST /api/actuals/import` (per row),
`DELETE /api/actuals/import/[batchId]`.

Three details worth flagging:

- **Moving an actual is checked in both directions.** `PUT /api/actuals/[id]` validates the
  *current* month **and** the *target* month. Checking only the target would let a user drag spend
  *out of* a closed period, silently changing numbers that were already signed off.
- **Check order inside every mutating route is auth → ownership → lock**, in that order. If the
  lock check ran first, the 423-vs-404 difference would let one tenant probe which records exist in
  another tenant.
- **The `POST /api/locks` route itself is not lock-checked** — locking an already-locked month is an
  idempotent upsert, and locking *is* the closing operation. `DELETE /api/locks/[month]` (unlocking)
  is unrestricted for the owner. That is a deliberate scope decision and a known audit gap; see
  [What I would improve](#what-i-would-improve-before-production).

The integration suite does not just assert the 423 — after every rejected write it re-reads the
document directly through the Mongoose model to confirm it is genuinely unchanged, and it verifies
that unlocking restores write access (proving the gate was ever really doing anything).

Source: [`src/lib/locks/service.ts`](src/lib/locks/service.ts), `tests/unit/locks.test.ts`,
`tests/integration/lockEnforcement.test.ts`.

### 4. CSV import semantics

Format is exactly the brief's:

```csv
month,category,amount
2026-01,Marketing,4800
2026-01,Payroll,20500
2026-02,Payroll,19800
```

A ready-to-use copy lives at [`scripts/sample-actuals.csv`](scripts/sample-actuals.csv).

- **Partial success.** Every row is validated independently. Bad rows land in `errors[]` with their
  1-based file line number and a reason; every valid row is still imported. A typo in row 40 must
  not discard the 39 good rows above it — finance users import exports from other systems and need
  the good data *plus* a precise list of what to fix.
- **Locked months are skipped, not fatal.** A row targeting a closed period lands in `skippedRows[]`
  (`"period 2026-01 is locked - row not imported"`). A 60-row file touching one closed month
  imports the other 59 and tells you which it refused. The lock is still fully enforced — nothing is
  written to a closed period.
- **Categories are matched, never created.** Matching is case- and whitespace-insensitive
  (`"  marketing  "` → `Marketing`) because CSVs come from humans and spreadsheets. An unknown name
  is a row error. Auto-creating would let a typo silently spawn a bucket and corrupt every
  subsequent report.
- **Rollback.** Every row in one import shares an `importBatchId`;
  `DELETE /api/actuals/import/[batchId]` unwinds the whole batch. Unlike the import, rollback is
  **all-or-nothing**: if any month in the batch has been locked since, the entire delete is refused
  with 423, because a partial unwind leaves a batch that can neither be finished nor re-run.
- **Both transports work.** `multipart/form-data` with a `file` field (what the UI uses) and a raw
  `text/csv` body (`curl --data-binary`), with a 2 MB cap checked against both `Content-Length` and
  the buffered size.
- Imported rows get an auto note `Imported from CSV (row N)` so the drill-down view shows
  provenance.

Response shape:

```json
{ "batchId": "…", "imported": 3, "skipped": 0, "skippedRows": [], "errors": [], "totalRows": 3 }
```

Source: [`src/lib/csv/parseActualsCsv.ts`](src/lib/csv/parseActualsCsv.ts) (pure, DB-free),
[`src/app/api/actuals/import/route.ts`](src/app/api/actuals/import/route.ts).

---

## Tech stack and why

| Choice | Why |
|---|---|
| **Next.js 14 (App Router) + TypeScript** | One codebase carries a feature from Route Handler to UI. Route Handlers run on the Node runtime (Mongoose and bcrypt are not edge-safe). |
| **MongoDB + Mongoose 8** | The domain is naturally document-shaped and the interesting work is index/query-pattern design (see below), not relational joins. Mongoose gives schema validation and typed models without an ORM's query abstraction. |
| **Hand-rolled auth** (`bcryptjs` + `jose` HS256 JWT in an httpOnly cookie) | NextAuth would add an adapter/version surface for a single email-password flow. Rolling it keeps the security decisions visible and reviewable: `select: false` on `passwordHash`, a dummy hash on unknown-email login so response timing does not reveal registered addresses, and a fail-closed JWT signer. |
| **zod** | Every request body, query string and CSV row is parsed before it reaches Mongo. Nothing untrusted is passed through. |
| **Recharts** | Composable React charting, no imperative canvas layer. |
| **Tailwind + hand-written UI primitives** | `src/components/ui/*` (Button, Input, Select, Table, Badge, Modal, Card, Alert, MonthPicker) rather than a component-library CLI — no remote registry dependency, and the modal is built on the native `<dialog>` element so focus trapping and Escape-to-close come from the platform. |
| **SWR** | Cache + revalidation for client data fetching, with conditional (`null`) keys so gated fetches genuinely do not fire. |
| **Vitest + mongodb-memory-server** | Fast unit tests for the pure math, real-MongoDB integration tests for the routes — no mocked database anywhere. |

Chart colours are a **validated** palette, not eyeballed: the plan/actual pair and the
over/under-plan diverging poles were run through a CVD and contrast validator against the card
surface and pass all checks. Colour is never the sole encoding — the monthly view carries sign in
bar direction and in the signed tooltip value, and the two-series view ships a legend.

---

## Data model

Five collections, all under `src/lib/db/models/`. **Month is stored as a `YYYY-MM` string, not a
`Date`** — lexicographic comparison is chronological, range queries are plain `$gte`/`$lte`, and
there is no timezone class of bug at all.

| Collection | Key fields | Indexes | Rationale |
|---|---|---|---|
| **users** | `email` (lowercased, unique), `passwordHash` (`select: false`), `name?` | `{email: 1}` unique | The unique constraint creates the index; a duplicate signup surfaces as 409, not a 500. `select: false` means a careless `User.find()` cannot leak hashes into a JSON response. |
| **categories** | `userId`, `name` (≤64 chars) | `{userId: 1, name: 1}` **unique** | Categories are **per user**, not global. Leading with `userId` makes the same index serve both "list my categories" and the uniqueness constraint. |
| **plans** | `userId`, `categoryId`, `month`, `amount` (≥0) | `{userId: 1, categoryId: 1, month: 1}` **unique**, `{userId: 1, month: 1}` | Exactly one target per (user, category, month) — that uniqueness is what makes `PUT /api/plans` a clean upsert. The second index covers the report's range scan, which has no `categoryId` predicate. |
| **actuals** | `userId`, `categoryId`, `month`, `amount` (≥0), `note?`, `source: 'manual'\|'csv_import'`, `importBatchId?` | `{userId: 1, categoryId: 1, month: 1}` (**not** unique), `{userId: 1, month: 1}`, `{importBatchId: 1}` sparse | **Append-only ledger.** Several entries may exist for the same category+month and the report sums them. A unique constraint would force read-modify-write and destroy the individual notes that make the drill-down useful. The sparse batch index stays small because only CSV rows carry a batch id. |
| **locks** | `userId`, `month`, `lockedAt` | `{userId: 1, month: 1}` **unique** | Document existence == locked. Unique makes `POST /api/locks` naturally idempotent via upsert. |

**Every compound index leads with `userId`**, which is also the first term of every query filter.
That is not incidental: it is what makes tenant isolation an index-level property rather than
something each handler has to remember, and it keeps every scan bounded to one tenant's slice of
the collection.

---

## API surface

All routes are Node-runtime Route Handlers under `src/app/api/**/route.ts`. Error shape is always
`{ "error": string }`. Status mapping is centralised in
[`src/lib/apiResponse.ts`](src/lib/apiResponse.ts): zod failure → 400, unauthenticated → 401, not
found / not yours → 404, duplicate key (Mongo 11000) → 409, locked period → 423, anything else →
a logged 500 with an opaque body.

| Route | Methods | Notes |
|---|---|---|
| `/api/auth/signup` | POST | seeds Marketing / Payroll / Tools for the new user |
| `/api/auth/login` `/logout` `/me` | POST / POST / GET | httpOnly `cv_session` cookie |
| `/api/categories` | GET, POST | 409 on duplicate name |
| `/api/plans` | GET `?from&to`, PUT (upsert) | lock-checked |
| `/api/plans/[id]` | DELETE | lock-checked |
| `/api/actuals` | GET `?from&to&categoryId`, POST | lock-checked |
| `/api/actuals/[id]` | PUT, DELETE | lock-checked on **both** source and target month |
| `/api/actuals/import` | POST | CSV, partial success |
| `/api/actuals/import/[batchId]` | DELETE | batch rollback, all-or-nothing |
| `/api/locks` | GET `?from&to`, POST | POST is idempotent |
| `/api/locks/[month]` | DELETE | unlock |
| `/api/report` | GET `?from&to&categoryId` | delegates all math to the pure aggregator |
| `/api/report/export` | GET `?from&to&categoryId` | CSV attachment (stretch goal) |

Report response contract:

```ts
{
  range: { from, to },
  rows: [{ categoryId, categoryName, month, plan, actual, variance,
           variancePct: number | null, isLocked, hasPlan, hasActual }],
  monthlyNetVariance: [{ month, netVariance }],
  categoryTotals:     [{ categoryId, categoryName, totalPlan, totalActual, totalVariance }]
}
```

`src/middleware.ts` deliberately **excludes `/api/*`** from its matcher: API routes must answer a
401 JSON body, not redirect to an HTML login page. Middleware only verifies the cookie signature
(Edge runtime, no DB); the real gate is `getSessionUser`, called by the authenticated layout **and**
by every route handler, which also confirms the user record still exists.

UI pages: `/login`, `/signup`, `/dashboard`, `/categories`, `/plans`, `/actuals`, `/report`,
`/locks`.

---

## Performance and indexing at scale

The dataset here is tiny; these are the choices that matter when it is not.

**Query shapes today.** Every read is `{ userId, month: { $gte, $lte } }`, optionally plus
`categoryId`. Those are served by `{userId:1, month:1}` and `{userId:1, categoryId:1, month:1}`
respectively — index scans bounded to one tenant and one contiguous month range, never a collection
scan. Because `month` is a `YYYY-MM` string, the range is a plain lexicographic bound with no date
casting.

**Aggregation is in-process, on purpose.** For a realistic range (a year × a few dozen categories ×
a handful of entries per cell) that is a few thousand small documents; a `$group` pipeline would add
round-trip complexity for no measurable win, and it would move the variance rules — the part the
brief cares most about — into a place that cannot be unit-tested without a database. The aggregator
is a pure function precisely so it stays fast to run and trivial to verify.

**What changes at volume.** The ledger design means actual-entry count grows with transaction
volume, not with categories × months. Past roughly the point where a single month's read is
thousands of documents, I would:

1. Add a **`monthly_actual_rollups` collection**: `{userId, categoryId, month, total, entryCount}`
   with a unique index on `{userId, categoryId, month}`, maintained incrementally by a `$inc` on
   every actual write/delete (or rebuilt from a change stream). The report then reads one small
   pre-aggregated document per cell instead of every ledger row, while the raw entries remain for
   drill-down and audit.
2. Move the report `$group` server-side into an aggregation pipeline hinted at
   `{userId:1, month:1}`, if the rollup is not enough.
3. Consider a **covering index** so hot report queries never touch documents at all:
   `{userId:1, month:1, categoryId:1, amount:1}`.
4. Once tenants get large, **shard on `userId`** (a hashed shard key). Every query already leads
   with `userId`, so all of them stay targeted single-shard operations — no scatter-gather. This is
   the concrete payoff of the userId-first index discipline.
5. Cache the report response per `(userId, from, to, categoryId)` and invalidate on any plan/actual
   write for that user, since reads dominate writes heavily in this access pattern.

---

## Testing

```bash
npm run test        # 184 tests, all green
npm run test:watch
```

**144 unit tests** — pure logic, no database:

| File | Tests | Covers |
|---|---:|---|
| `tests/unit/variance.test.ts` | 26 | variance / variance %, plan = 0 → `null`, non-finite inputs, rounding |
| `tests/unit/aggregate.test.ts` | 20 | the sample table as a fixture, ledger summing, no-cross-product rule, continuous chart axis, float rounding, **plus a module-purity guard** that reads `variance.ts`/`aggregate.ts` and asserts their imports mention neither `mongoose`, `next`, nor `@/lib/db` — so the pure boundary cannot silently rot |
| `tests/unit/locks.test.ts` | 15 | lock predicates, both-directions move guard |
| `tests/unit/csvImport.test.ts` | 37 | header validation, per-row errors with correct line numbers, category matching, partial success |
| `tests/unit/month.test.ts` | 46 | `YYYY-MM` validation, range expansion, quarter helpers |

**40 integration tests** — real route handlers against a real MongoDB (`mongodb-memory-server`),
**no mocked DB anywhere**:

| File | Tests | Covers |
|---|---:|---|
| `tests/integration/ownership.test.ts` | 11 | two tenants; B never sees A's rows, and B mutating with A's ids returns **404** (not 403). Documents are re-read after each rejected attempt to confirm nothing was silently mutated. |
| `tests/integration/lockEnforcement.test.ts` | 10 | 423 on every locked-period write for both Plan and Actual, with document-level verification that the stored value is unchanged; both directions of the move guard; idempotent re-lock; unlock restores write access |
| `tests/integration/report.test.ts` | 6 | the sample table cell-for-cell via the real POST/PUT routes; roll-ups; `?categoryId=` filter; `isLocked`; ledger summing |
| `tests/integration/csvImport.test.ts` | 13 | the assignment's exact CSV; malformed month / unknown category / negative amount; mixed valid+invalid partial success; locked-month rows skipped and genuinely absent; re-import creating a second batch rather than overwriting; rollback scoped to one batch, refused at 423 while locked, succeeding after unlock; both the multipart and raw-`text/csv` transports |

The app was additionally walked through manually against a live `next dev` server and a real
MongoDB container: signup, plans, actuals, CSV import via the UI's real multipart path, report,
lock → 423, unlock, logout revoking the session.

---

## Assumptions and tradeoffs

Where the brief was ambiguous I made a call and documented it. The interesting ones:

1. **Categories are per user, not global.** Each user owns their own `Marketing`. A shared global
   taxonomy would be the right model for a single-company deployment, but this is a multi-tenant
   app and cross-tenant category sharing would leak one user's chart of accounts into another's.
   New accounts are seeded with Marketing / Payroll / Tools so nothing starts empty.

2. **Category CRUD is create-only.** Per the brief ("a fixed seed list is acceptable if you document
   that CRUD is out of scope"), users can create categories but not rename or delete them. Rename
   is straightforward; **delete is not** — it needs a decision about orphaned plans and actuals
   (cascade? soft-delete? block while referenced?) that has real reporting consequences, and I would
   rather not ship a half-answer to it in a take-home. The aggregator defensively renders an
   unresolvable `categoryId` as `"Unknown category"` rather than dropping the row, so money can
   never silently vanish from a total.

3. **Actuals are an append-only ledger, not one row per category-month.** Multiple entries per cell
   are allowed and summed. This is what makes CSV re-import safe: importing the same file twice
   creates a *second* batch and doubles the totals visibly, rather than silently overwriting the
   first import — and `importBatchId` lets you undo exactly one of them. The tradeoff is that a
   correction is "add a compensating entry or roll back the batch", not "edit the number", and the
   report has to sum rather than read a single document. That is the right shape for financial data
   and the right shape for the drill-down view; the scaling answer is the rollup collection above.

4. **Cross-tenant access returns 404, never 403.** Fetching or mutating a record that exists but
   belongs to someone else is indistinguishable from fetching one that does not exist. A 403 would
   confirm the existence of another tenant's data — an enumeration oracle. The lock check runs
   *after* the ownership check for the same reason: a 423-vs-404 difference would leak the same
   information.

5. **CSV import is partial-success; batch rollback is all-or-nothing.** Deliberately asymmetric —
   the reasoning for each is in [CSV import semantics](#4-csv-import-semantics).

6. **Hand-rolled JWT auth instead of NextAuth.** For one email-password flow, NextAuth's adapter and
   version surface costs more than it saves, and it hides exactly the decisions worth showing. The
   tradeoff is that OAuth providers, email verification, and password reset are not there — all of
   which NextAuth would give for free and all of which are on the production list below.

7. **Locking is per user.** There is no organisation/team concept in this build, so "who may close a
   period" is simply "the owner". A real deployment needs a role check here (see below).

8. **Unlocking is unrestricted for the owner and leaves no trail.** Combined with the point above,
   this is the biggest deliberate gap. In production, closing and reopening a period is exactly the
   event an auditor asks about.

9. **Money is stored as a JS `Number` (IEEE double).** Validated to be finite, non-negative, and
   below 10¹², and all display values are rounded to 2 dp with an epsilon-nudged rounder. Correct at
   this scale; a production ledger should use `Decimal128` or integer minor units to remove floating
   point from the accounting path entirely.

10. **`YYYY-MM` strings over `Date`.** Sortable, range-queryable, human-readable in the database,
    and immune to timezone drift. The cost is that any future date arithmetic goes through
    `src/lib/utils/month.ts` helpers rather than a date library — a trade I would make again.

11. **Currency is unlabelled.** There is one implicit currency and no FX. Multi-currency would need
    a currency field per category or per entry plus a rate table, which is well outside the brief.

---

## What I would improve before production

Roughly in the order I would do them.

**Auditability** — the theme that matters most for financial data:

- **Immutable audit log.** Every mutation of a plan, actual, or lock appended to an
  `audit_events` collection: actor, timestamp, entity, before/after, request id. Reopening a closed
  period in particular should be an event someone can be asked about six months later.
- **Lock/unlock authorisation.** Today the owner can reopen any period freely. In production,
  closing a period should require an approver role, and reopening should require a reason string
  that lands in the audit log.
- **Soft deletes** for actuals rather than hard `deleteOne`, so a rollback is reversible and the
  ledger is genuinely append-only end to end.

**Security:**

- **Rate limiting on the auth routes** (login, signup) — currently unthrottled. Redis/Upstash
  fixed-window per IP + per email, plus a progressive lockout.
- **Secrets in a managed store** (AWS Secrets Manager / SSM Parameter Store with rotation) rather
  than environment variables pasted into a dashboard.
- **IP-restricted database access.** An Atlas M0 for a demo typically ends up with `0.0.0.0/0` on
  the access list; production should be VPC peering or PrivateLink, with a `readWrite`-scoped
  database user rather than an admin one.
- **CSRF defence in depth.** The session cookie is httpOnly and `SameSite`, which covers the common
  case, but a double-submit token on mutating routes is cheap insurance.
- **Refresh/rotation for the session JWT**, plus a server-side revocation list so logout is
  authoritative rather than cookie-clearing.
- **Password reset and email verification** (absent today).

**Correctness and scale:**

- **`Decimal128` or integer minor units** for money.
- **The `monthly_actual_rollups` collection** described in
  [Performance and indexing at scale](#performance-and-indexing-at-scale), once entry volume
  justifies it.
- **Multi-tenancy proper** — an organisation entity, roles (viewer/editor/approver), and
  category ownership at the org level rather than the user level.
- **Category rename/delete** with an explicit orphan policy.

**Operations:**

- **Structured logging with request ids** and an error tracker (Sentry) instead of `console.error`.
- **Health/readiness endpoint** that pings Mongo, so the platform can pull a bad instance.
- **CI**: GitHub Actions running `npm run lint`, `tsc --noEmit`, `npm run test`, and `npm run build`
  on every PR — all four already pass locally and are the natural gate.
- **E2E smoke tests** (Playwright) for the signup → plan → actual → lock → report path.

**AWS equivalent of the deployment below**, since the deploy target here is Vercel + Atlas: the
Next.js app on **ECS Fargate** behind an **ALB** (or Lambda@Edge/OpenNext if serverless is
preferred), **DocumentDB** or Atlas-on-AWS via PrivateLink for the database, **Secrets Manager** for
`AUTH_SECRET` and the connection string, **CloudWatch Logs + X-Ray** for tracing,
**WAF** in front of the ALB for the rate limiting above, and **CDK** for the whole stack so the
environment is reproducible. The Mongoose connection cache described below matters even more in a
Lambda deployment than it does on Vercel.

---

## Deployment

Not yet deployed. These are the exact steps; they need your own MongoDB Atlas and Vercel accounts
(both have free tiers sufficient for this app).

### 1. MongoDB Atlas

1. Create a free **M0** cluster at [cloud.mongodb.com](https://cloud.mongodb.com) (any region;
   pick one close to your Vercel region).
2. **Database Access → Add New Database User.** Create a user with the **Read and write to any
   database** role — *not* Atlas admin. Save the password.
3. **Network Access → Add IP Address.** Vercel's serverless functions do not have static IPs, so
   for a demo deployment you will need `0.0.0.0/0` ("Allow access from anywhere"). This is
   acceptable for a throwaway demo cluster with a scoped user and a strong password; for anything
   real, use PrivateLink or a static-egress proxy instead (see the production list above).
4. **Connect → Drivers** and copy the connection string. Add the database name to the path:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/crossval?retryWrites=true&w=majority
   ```
   URL-encode the password if it contains `@`, `:`, `/` or `#`.

### 2. Push to GitHub

```bash
git remote add origin git@github.com:<you>/crossval-plan-vs-actual.git
git push -u origin main
```

`.env.local` is gitignored — confirm with `git ls-files | grep env` that only `.env.example` is
tracked.

### 3. Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → select the repo.
2. Framework preset auto-detects **Next.js**. Leave build command and output directory at their
   defaults.
3. **Environment Variables** — add all three for the Production environment (and Preview, if you
   want preview deploys to work):

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas string from step 1.4 |
   | `AUTH_SECRET` | a **fresh** `openssl rand -hex 32` — do not reuse your local one |
   | `NODE_ENV` | `production` |

4. **Deploy.** Vercel defaults to Node 20.x, which this app supports (Project Settings → General →
   Node.js Version if you want to pin it explicitly).

### 4. Seed the live database

So the reviewer's live URL has data to look at, run the seed once against Atlas from your machine:

```bash
MONGODB_URI='mongodb+srv://…/crossval?retryWrites=true&w=majority' npm run seed
```

It should print **SELF-CHECK PASSED**. The script is idempotent — running it twice produces the same
state.

### 5. Verify and record the URL

1. Open the Vercel URL, log in as `demo@crossval.test` / `Demo1234!`.
2. Go to **Report**, set the range to **Q1 2026**, and confirm the four sample rows match the table
   in [How missing actuals are displayed](#2-how-missing-actuals-are-displayed).
3. **Upload a CSV via the UI** (`scripts/sample-actuals.csv` on the Actuals page). This exercises
   the multipart path specifically — worth confirming once on the live runtime.
4. Go to **Locks**, lock 2026-01, return to **Plans**, and confirm editing that month is refused.
5. Put the live URL at the top of this README (replace the placeholder) and in the submission email.

### Serverless connection note (already handled)

[`src/lib/db/connect.ts`](src/lib/db/connect.ts) caches both the resolved Mongoose connection **and**
the in-flight connect promise on `globalThis`. Without this, every warm-container invocation
re-evaluates module scope, opens a fresh pool, and the cluster hits its connection limit — the
classic serverless connection storm, and the single most common way a Mongoose + Vercel deployment
falls over under any real traffic. A failed dial resets the cached promise so the next request
retries instead of awaiting a permanently rejected promise. `bufferCommands: false` is set so a
query against a dead connection fails fast rather than hanging until the function times out.

---

## Stretch goals

| Stretch goal | Status |
|---|---|
| **Drill-down** — click a report cell to see the underlying actual entries | **Done.** Clicking (or pressing Enter on) any report row opens a modal listing the individual `Actual` documents for that category+month, with notes and CSV provenance. Built on the native `<dialog>` element; the fetch is gated on a conditional SWR key so nothing is requested until a row is opened. |
| **Export** — download the report as CSV | **Done.** `GET /api/report/export?from&to&categoryId` returns the table as a CSV attachment. Fields beginning with `= + - @` are prefixed with `'` so a category name or note is not executed as a formula when the file is opened in Excel or Sheets (CSV injection — tested). |
| **Fiscal year** — fiscal year selector | **Not implemented.** The date-range picker has Q1–Q4 and a full-year preset for the selected year, but those are **calendar** quarters and a calendar year (the brief says "calendar year default is fine"). A configurable non-January fiscal year start is not built. Note that the month-level locking granularity was chosen partly so that adding it later would not require a second locking model. |

The report also ships a chart with two views — monthly net variance (signed bars) and category
totals (grouped plan vs actual) — beyond the "at least one chart" requirement.

---

## Troubleshooting

**`npm run docker:up` fails with "unknown command: compose".**
The Docker *engine* is installed but the Compose plugin is not. Either install the plugin
(`sudo apt install docker-compose-plugin`) or start Mongo directly:

```bash
docker run -d --name crossval-mongo -p 27017:27017 mongo:7
```

**`MONGODB_URI is not set`.** You skipped `cp .env.example .env.local`, or you are running
`npm run seed` from a shell that does not see it. The seed script loads `.env.local` then `.env`
explicitly (Next does this automatically for the app, but `tsx` does not).

**Login always fails after changing `AUTH_SECRET`.** Existing `cv_session` cookies were signed with
the old secret and no longer verify. Clear the cookie and log in again.

**`git` reports "detected dubious ownership".** This checkout's root directory is owned by `root`
while its contents are owned by your user. Fix with
`sudo chown $USER:$USER /home/alan/projetos/crossval`, or add a `safe.directory` exception.

---

## Project layout

```
src/
  app/
    (auth)/{login,signup}/page.tsx
    (app)/{dashboard,categories,plans,actuals,report,locks}/page.tsx
    api/**/route.ts                 15 Route Handlers, Node runtime
  components/{ui,layout,report,plans,actuals,locks}/
  lib/
    db/{connect.ts, models/{User,Category,Plan,Actual,Lock}.ts}
    auth/{password,session,getSessionUser}.ts
    report/{variance,aggregate,types}.ts    ← pure, DB-free, the heart of the correctness story
    locks/service.ts
    csv/{parseActualsCsv,toCsv}.ts
    validation/schemas.ts
    api/{client,hooks,types}.ts     browser-side fetch wrapper + SWR hooks
    utils/{month,format,cn}.ts
    apiResponse.ts
  middleware.ts
scripts/{seed.ts, sample-actuals.csv}
tests/{unit,integration}/
```
