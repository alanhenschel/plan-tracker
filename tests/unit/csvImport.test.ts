import { describe, expect, it } from 'vitest';
import { CsvFormatError, parseActualsCsv } from '@/lib/csv/parseActualsCsv';
import { escapeCsvField, toCsv } from '@/lib/csv/toCsv';

const CATEGORIES = [
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', name: 'Marketing' },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', name: 'Payroll' },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa3', name: 'Tools' },
];

/** The CSV block from the assignment spec, verbatim. */
const SPEC_CSV = ['month,category,amount', '2026-01,Marketing,4800', '2026-01,Payroll,20500', '2026-02,Payroll,19800'].join(
  '\n',
);

describe('parseActualsCsv - the spec CSV', () => {
  it('parses all three rows with resolved category ids', () => {
    const { rows, errors } = parseActualsCsv(SPEC_CSV, CATEGORIES);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { row: 2, month: '2026-01', categoryName: 'Marketing', categoryId: CATEGORIES[0].id, amount: 4800 },
      { row: 3, month: '2026-01', categoryName: 'Payroll', categoryId: CATEGORIES[1].id, amount: 20500 },
      { row: 4, month: '2026-02', categoryName: 'Payroll', categoryId: CATEGORIES[1].id, amount: 19800 },
    ]);
  });

  it('numbers rows against the original file, header included', () => {
    const { rows } = parseActualsCsv(SPEC_CSV, CATEGORIES);
    // First data row is line 2 of the file, so an error message points at the
    // line the user actually sees in their editor.
    expect(rows[0].row).toBe(2);
  });
});

describe('parseActualsCsv - month validation', () => {
  it.each([
    ['2026-13', 'month 13'],
    ['2026-00', 'month 0'],
    ['2026-1', 'not zero padded'],
    ['26-01', 'two digit year'],
    ['2026/01', 'wrong separator'],
    ['2026-01-15', 'a full date'],
    ['', 'empty'],
  ])('rejects %j (%s) without discarding the file', (badMonth) => {
    const csv = ['month,category,amount', `${badMonth},Marketing,100`, '2026-02,Payroll,200'].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);

    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
    expect(errors[0].reason).toMatch(/YYYY-MM/);
    // Partial success: the good row still comes through.
    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe('2026-02');
  });
});

describe('parseActualsCsv - category validation', () => {
  it('rejects an unknown category and says so explicitly', () => {
    const csv = ['month,category,amount', '2026-01,Recruiting,500'].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('Recruiting');
    // Never silently creating categories is the point - a typo must not spawn
    // a new bucket and corrupt subsequent reports.
    expect(errors[0].reason).toMatch(/will not create/i);
  });

  it('matches category names case-insensitively and trims whitespace', () => {
    const csv = ['month,category,amount', '2026-01,  marketing  ,100', '2026-01,PAYROLL,200'].join(
      '\n',
    );
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);

    expect(errors).toEqual([]);
    expect(rows.map((r) => r.categoryName)).toEqual(['Marketing', 'Payroll']);
    // The canonical stored name is returned, not the user's casing.
    expect(rows[0].categoryId).toBe(CATEGORIES[0].id);
  });

  it('rejects an empty category cell', () => {
    const csv = ['month,category,amount', '2026-01,,100'].join('\n');
    const { errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors[0].reason).toMatch(/category is empty/);
  });
});

describe('parseActualsCsv - amount validation', () => {
  it('rejects a negative amount', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,-500'].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(rows).toEqual([]);
    expect(errors[0].reason).toMatch(/negative/);
  });

  it('rejects non-numeric text rather than coercing it to 0', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,five hundred'].join('\n');
    const { errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors[0].reason).toMatch(/not a valid number/);
  });

  it('rejects an empty amount', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,'].join('\n');
    const { errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors[0].reason).toMatch(/amount is empty/);
  });

  it('accepts a zero amount as a legitimate logged value', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,0'].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows[0].amount).toBe(0);
  });

  it('accepts decimals', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,1234.56'].join('\n');
    const { rows } = parseActualsCsv(csv, CATEGORIES);
    expect(rows[0].amount).toBe(1234.56);
  });

  it('tolerates thousands separators and a currency symbol from spreadsheet exports', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,"$20,500"'].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows[0].amount).toBe(20500);
  });

  it('rejects an unrealistically large amount', () => {
    const csv = ['month,category,amount', '2026-01,Marketing,99999999999999'].join('\n');
    const { errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors[0].reason).toMatch(/unrealistically large/);
  });
});

describe('parseActualsCsv - file-level problems', () => {
  it('throws CsvFormatError for empty content', () => {
    expect(() => parseActualsCsv('', CATEGORIES)).toThrow(CsvFormatError);
    expect(() => parseActualsCsv('   \n  ', CATEGORIES)).toThrow(CsvFormatError);
  });

  it('throws when a required column is missing', () => {
    const csv = ['month,amount', '2026-01,100'].join('\n');
    expect(() => parseActualsCsv(csv, CATEGORIES)).toThrow(/Missing required column/);
  });

  it('throws when the file is a header with no data rows', () => {
    expect(() => parseActualsCsv('month,category,amount', CATEGORIES)).toThrow(
      /no data rows/,
    );
  });

  it('accepts headers in any case and with surrounding whitespace', () => {
    const csv = [' Month , Category , Amount ', '2026-01,Marketing,100'].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('strips a UTF-8 BOM, which Excel writes on every export', () => {
    const csv = `﻿month,category,amount\n2026-01,Marketing,100`;
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const csv = 'month,category,amount\r\n2026-01,Marketing,100\r\n2026-02,Payroll,200\r\n';
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('skips blank lines', () => {
    const csv = 'month,category,amount\n2026-01,Marketing,100\n\n2026-02,Payroll,200\n';
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('reports every bad row, not just the first', () => {
    const csv = [
      'month,category,amount',
      '2026-99,Marketing,100', // bad month
      '2026-01,Nope,100', // unknown category
      '2026-01,Payroll,abc', // bad amount
      '2026-02,Tools,50', // good
    ].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);

    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryName).toBe('Tools');
  });

  it('allows several rows for the same category and month (they sum in the report)', () => {
    const csv = [
      'month,category,amount',
      '2026-01,Marketing,1000',
      '2026-01,Marketing,3800',
    ].join('\n');
    const { rows, errors } = parseActualsCsv(csv, CATEGORIES);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });
});

describe('toCsv / escapeCsvField', () => {
  it('quotes fields containing a comma', () => {
    expect(escapeCsvField('Marketing, EMEA')).toBe('"Marketing, EMEA"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders null and undefined as empty cells', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  /**
   * CSV injection: a note or category name beginning with =, +, - or @ is
   * executed as a formula by Excel and Google Sheets. Prefixing a single quote
   * makes the spreadsheet treat it as text.
   */
  it.each(['=SUM(A1:A9)', '+1234', '-1+1', '@import'])(
    'neutralises the formula prefix in %j',
    (payload) => {
      expect(escapeCsvField(payload).replace(/^"|"$/g, '')).toMatch(/^'/);
    },
  );

  it('builds a CRLF-delimited document with a header', () => {
    const csv = toCsv(['month', 'amount'], [['2026-01', 100]]);
    expect(csv).toBe('month,amount\r\n2026-01,100\r\n');
  });
});
