import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Never expose this: every read path must project it away or map to a DTO.
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, trim: true },
  },
  { timestamps: true, collection: 'users' },
);

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>('User', UserSchema);
