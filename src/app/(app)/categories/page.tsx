'use client';

import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { EmptyRow, TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { useCategories } from '@/lib/api/hooks';
import { api, errorMessage } from '@/lib/api/client';

export default function CategoriesPage() {
  const { data, error, isLoading, mutate } = useCategories();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/categories', { name: name.trim() });
      setName('');
      await mutate();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create the category'));
    } finally {
      setSubmitting(false);
    }
  }

  const categories = data?.categories ?? [];

  return (
    <>
      <PageHeader
        title="Categories"
        description="Spending buckets that plans and actuals are assigned to. New accounts start with Marketing, Payroll and Tools."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              label="New category"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Contractors"
              maxLength={64}
              required
            />
            {formError && <Alert tone="error">{formError}</Alert>}
            <Button type="submit" loading={submitting} disabled={name.trim() === ''}>
              Add category
            </Button>
            <p className="text-xs text-slate-500">
              Categories are create-only. Renaming or deleting one would rewrite the
              numbers on periods that have already been locked and signed off, so it is
              deliberately out of scope.
            </p>
          </form>
        </Card>

        <div>
          {error && <Alert tone="error" className="mb-3">{errorMessage(error)}</Alert>}
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
              </TR>
            </THead>
            <TBody>
              {isLoading && <EmptyRow colSpan={1}>Loading categories...</EmptyRow>}
              {!isLoading && categories.length === 0 && (
                <EmptyRow colSpan={1}>No categories yet. Create your first one.</EmptyRow>
              )}
              {categories.map((category) => (
                <TR key={category.id}>
                  <TD>{category.name}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </>
  );
}
