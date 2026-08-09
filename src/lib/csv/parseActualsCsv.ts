import { parse } from 'csv-parse/sync';
import { MONTH_REGEX } from '@/lib/utils/month';

/**
 * Parses and validates the actuals CSV.
 *
 * Format (per the assignment spec):
 *
 *   month,category,amount
 *   2026-01,Marketing,4800
 *
 * Design notes:
 *   - No DB access. The caller supplies the user's category names, so this
 *     module is unit-testable and the route stays responsible for I/O.
 *   - Partial success by design: every row is validated independently and bad
 *     rows are reported with their 1-based file line number. A single typo in
 *     row 40 must not discard the 39 good rows above it - finance users import
 *     exports from other systems and need to know exactly what failed.
 *   - Category matching is case- and whitespace-insensitive ("  marketing  "
 *     resolves to "Marketing") because CSVs come from humans and spreadsheets.
 *     It never creates categories: a typo would otherwise silently spawn a new
 *     bucket and corrupt every subsequent report.
 */

export interface ParsedActualRow {
  /** 1-based line number in the original file, including the header line. */
  row: number;
  month: string;
  categoryName: string;
  categoryId: string;
  amount: number;
}

export interface CsvRowError {
  /** 1-based line number in the original file, including the header line. */
  row: number;
  reason: string;
}

export interface ParseActualsCsvResult {
  rows: ParsedActualRow[];
  errors: CsvRowError[];
}

export interface CategoryLookupEntry {
  id: string;
  name: string;
}

const REQUIRED_HEADERS = ['month', 'category', 'amount'] as const;

/** Thrown for problems with the file as a whole, not an individual row. */
export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

function normaliseCategoryKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Parses `amount`, rejecting anything that is not a plain non-negative number.
 *
 * Strips thousands separators and a leading currency symbol because
 * spreadsheet exports routinely include them, but refuses `1,2,3`-style
 * garbage, blanks, NaN and Infinity rather than coercing them to 0.
 */
function parseAmount(raw: string): { value: number } | { error: string } {
  const cleaned = raw.trim().replace(/^[$£€د.إ]+/u, '').replace(/,/g, '').trim();

  if (cleaned === '') return { error: 'amount is empty' };
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { error: `amount "${raw.trim()}" is not a valid number` };
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { error: `amount "${raw.trim()}" is not a finite number` };
  if (value < 0) return { error: `amount "${raw.trim()}" is negative` };
  if (value > 1_000_000_000_000) return { error: `amount "${raw.trim()}" is unrealistically large` };

  return { value };
}

export function parseActualsCsv(
  content: string,
  categories: readonly CategoryLookupEntry[],
): ParseActualsCsvResult {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new CsvFormatError('The CSV file is empty');
  }

  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new CsvFormatError(
      `Could not parse the CSV: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }

  if (records.length === 0) {
    throw new CsvFormatError('The CSV file has a header but no data rows');
  }

  const presentHeaders = new Set(Object.keys(records[0]));
  const missing = REQUIRED_HEADERS.filter((h) => !presentHeaders.has(h));
  if (missing.length > 0) {
    throw new CsvFormatError(
      `Missing required column(s): ${missing.join(', ')}. Expected header: month,category,amount`,
    );
  }

  const categoryByKey = new Map(categories.map((c) => [normaliseCategoryKey(c.name), c]));

  const rows: ParsedActualRow[] = [];
  const errors: CsvRowError[] = [];

  records.forEach((record, index) => {
    // +2: one for the header line, one to make it 1-based.
    const rowNumber = index + 2;

    const monthRaw = (record.month ?? '').trim();
    const categoryRaw = (record.category ?? '').trim();
    const amountRaw = record.amount ?? '';

    if (!MONTH_REGEX.test(monthRaw)) {
      errors.push({
        row: rowNumber,
        reason: `month "${monthRaw}" is not in YYYY-MM format`,
      });
      return;
    }

    if (categoryRaw === '') {
      errors.push({ row: rowNumber, reason: 'category is empty' });
      return;
    }

    const category = categoryByKey.get(normaliseCategoryKey(categoryRaw));
    if (!category) {
      errors.push({
        row: rowNumber,
        reason: `unknown category "${categoryRaw}" - create it first, import will not create categories`,
      });
      return;
    }

    const amount = parseAmount(String(amountRaw));
    if ('error' in amount) {
      errors.push({ row: rowNumber, reason: amount.error });
      return;
    }

    rows.push({
      row: rowNumber,
      month: monthRaw,
      categoryName: category.name,
      categoryId: category.id,
      amount: amount.value,
    });
  });

  return { rows, errors };
}
