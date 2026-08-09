'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { api, errorMessage } from '@/lib/api/client';
import type { ImportResponse } from '@/lib/api/types';

/**
 * CSV import panel.
 *
 * Import is partial-success by design, so the result summary is the important
 * part of this UI: how many rows landed, which rows were rejected and why, and
 * which rows were skipped because their period is locked.
 */
export function CsvImportForm({ onImported }: { onImported: () => void | Promise<unknown> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const response = await api.uploadCsv<ImportResponse>('/api/actuals/import', file);
      setResult(response);
      await onImported();
    } catch (err) {
      setError(errorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback(batchId: string) {
    setError(null);
    setBusy(true);
    try {
      await api.del(`/api/actuals/import/${batchId}`);
      setResult(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await onImported();
    } catch (err) {
      setError(errorMessage(err, 'Could not roll back the import'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="csv-file" className="mb-1 block text-sm font-medium text-slate-700">
          CSV file
        </label>
        <input
          ref={inputRef}
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
        />
        <p className="mt-1 text-xs text-slate-500">
          Header row required: <code className="font-mono">month,category,amount</code>. Category
          names must already exist; import never creates them.
        </p>
      </div>

      <Button onClick={handleUpload} loading={busy} disabled={!file}>
        Import CSV
      </Button>

      {error && <Alert tone="error">{error}</Alert>}

      {result && (
        <div className="space-y-2">
          <Alert tone={result.errors.length > 0 || result.skipped > 0 ? 'warning' : 'success'}>
            Imported {result.imported} of {result.totalRows} row(s).
            {result.skipped > 0 && ` ${result.skipped} skipped (locked period).`}
            {result.errors.length > 0 && ` ${result.errors.length} rejected.`}
          </Alert>

          {result.errors.length > 0 && (
            <IssueList title="Rejected rows" issues={result.errors} tone="error" />
          )}
          {result.skippedRows.length > 0 && (
            <IssueList title="Skipped rows (locked period)" issues={result.skippedRows} tone="warning" />
          )}

          {result.batchId && (
            <div className="flex items-center gap-3 pt-1">
              <Button variant="secondary" size="sm" loading={busy} onClick={() => handleRollback(result.batchId!)}>
                Undo this import
              </Button>
              <span className="font-mono text-xs text-slate-400">batch {result.batchId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: { row: number; reason: string }[];
  tone: 'error' | 'warning';
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul
        className={`max-h-40 space-y-1 overflow-y-auto rounded-md p-2 text-xs ring-1 ring-inset ${
          tone === 'error' ? 'bg-rose-50 ring-rose-200' : 'bg-amber-50 ring-amber-200'
        }`}
      >
        {issues.map((issue) => (
          <li key={`${issue.row}-${issue.reason}`}>
            <span className="font-medium">Row {issue.row}:</span> {issue.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
