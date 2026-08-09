import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { MONTH_REGEX } from '@/lib/utils/month';

export type ActualSource = 'manual' | 'csv_import';

export interface ActualDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  month: string; // YYYY-MM
  amount: number;
  note?: string;
  source: ActualSource;
  importBatchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActualSchema = new Schema<ActualDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    month: {
      type: String,
      required: true,
      match: [MONTH_REGEX, 'month must be in YYYY-MM format'],
    },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, maxlength: 500 },
    source: { type: String, enum: ['manual', 'csv_import'], required: true, default: 'manual' },
    importBatchId: { type: String },
  },
  { timestamps: true, collection: 'actuals' },
);

// Deliberately NOT unique. Actuals are a ledger: a user may log several
// transactions against the same category+month and the report sums them.
// A unique constraint here would force clients to read-modify-write and would
// lose the individual notes that make the drill-down view useful.
ActualSchema.index({ userId: 1, categoryId: 1, month: 1 });
ActualSchema.index({ userId: 1, month: 1 });
// Sparse: only csv_import rows carry a batch id, so the index stays small.
ActualSchema.index({ importBatchId: 1 }, { sparse: true });

export const Actual: Model<ActualDoc> =
  (mongoose.models.Actual as Model<ActualDoc>) ??
  mongoose.model<ActualDoc>('Actual', ActualSchema);
