import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface CategoryDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<CategoryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 64 },
  },
  { timestamps: true, collection: 'categories' },
);

// One category name per user. Leads with userId so it also serves
// "list all categories for this user" and enforces tenant isolation.
CategorySchema.index({ userId: 1, name: 1 }, { unique: true });

export const Category: Model<CategoryDoc> =
  (mongoose.models.Category as Model<CategoryDoc>) ??
  mongoose.model<CategoryDoc>('Category', CategorySchema);

export const DEFAULT_CATEGORY_NAMES = ['Marketing', 'Payroll', 'Tools'] as const;
