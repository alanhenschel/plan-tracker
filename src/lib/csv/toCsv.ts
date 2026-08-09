/**
 * Minimal RFC 4180 CSV serialiser.
 *
 * PURE MODULE - no imports. Used by the report export route.
 */

/**
 * Quotes a field when it contains a delimiter, quote or newline, and doubles
 * embedded quotes.
 *
 * The leading-character guard neutralises CSV injection: a field starting with
 * `=`, `+`, `-` or `@` is interpreted as a formula by Excel and Sheets, so a
 * malicious category name or note could execute on the reviewer's machine. We
 * prefix a single quote, which spreadsheets render as plain text.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  // Trailing newline so the file ends cleanly in every editor.
  return `${lines.join('\r\n')}\r\n`;
}
