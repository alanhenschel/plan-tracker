import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { MONTH_REGEX } from '@/lib/utils/month';

export interface PlanDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  month: string; // YYYY-MM
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<PlanDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    month: {
      type: String,
      required: true,
      match: [MONTH_REGEX, 'month must be in YYYY-MM format'],
    },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, collection: 'plans' },
);

// Exactly one target per (user, category, month) — this is what makes PUT an upsert.
PlanSchema.index({ userId: 1, categoryId: 1, month: 1 }, { unique: true });
// Covers the report's range scan: userId + month range, no categoryId predicate.
PlanSchema.index({ userId: 1, month: 1 });

export const Plan: Model<PlanDoc> =
  (mongoose.models.Plan as Model<PlanDoc>) ?? mongoose.model<PlanDoc>('Plan', PlanSchema);
