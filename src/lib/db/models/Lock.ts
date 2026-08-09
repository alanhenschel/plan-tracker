import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { MONTH_REGEX } from '@/lib/utils/month';

export interface LockDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  month: string; // YYYY-MM
  lockedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Presence of a document == the month is locked. There is no `isLocked` boolean:
 * a boolean would allow the ambiguous "row exists but false" state, and unlocking
 * is a delete, which leaves the collection as a clean audit-friendly set of
 * currently-closed periods.
 */
const LockSchema = new Schema<LockDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: {
      type: String,
      required: true,
      match: [MONTH_REGEX, 'month must be in YYYY-MM format'],
    },
    lockedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'locks' },
);

// Unique so POST /api/locks is naturally idempotent via upsert.
LockSchema.index({ userId: 1, month: 1 }, { unique: true });

export const Lock: Model<LockDoc> =
  (mongoose.models.Lock as Model<LockDoc>) ?? mongoose.model<LockDoc>('Lock', LockSchema);
