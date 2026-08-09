'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { api, errorMessage } from '@/lib/api/client';
import type { CategoryDto } from '@/lib/api/types';

export function ActualForm({
  categories,
  defaultMonth,
  onCreated,
}: {
  categories: CategoryDto[];
  defaultMonth: string;
  onCreated: () => void | Promise<unknown>;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [month, setMonth] = useState(defaultMonth);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Amount must be a number of 0 or more.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/actuals', {
        categoryId,
        month,
        amount: parsedAmount,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setAmount('');
      setNote('');
      await onCreated();
    } catch (err) {
      // A 423 lands here when the month was locked in another tab since load.
      setError(errorMessage(err, 'Could not log the actual'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Select
        label="Category"
        required
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="" disabled>
          Select a category
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      <MonthPicker label="Month" value={month} onChange={setMonth} />

      <Input
        label="Amount"
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
      />

      <Input
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional"
        maxLength={500}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Button type="submit" loading={submitting} disabled={!categoryId}>
        Log actual
      </Button>
    </form>
  );
}
