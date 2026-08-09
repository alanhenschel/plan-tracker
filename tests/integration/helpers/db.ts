import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '@/lib/db/connect';

/**
 * Real MongoDB, in-process, via mongodb-memory-server — deliberately NOT a
 * mocked Mongoose model. Nullable-field bugs (`select: false`, sparse
 * indexes, unique-constraint 11000 mapping, `lean()` shapes) only show up
 * against a real query planner; mocking the DB would hide exactly the class
 * of bug this test layer exists to catch.
 */

let mongod: MongoMemoryServer | null = null;

export async function startTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  // 32+ chars required by src/lib/auth/session.ts's fail-closed check.
  process.env.AUTH_SECRET = 'integration-test-secret-please-do-not-use-in-prod-32chars';
  await connectToDatabase();
}

export async function stopTestDb(): Promise<void> {
  await disconnectFromDatabase();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

/** Wipes all collections between tests so each test starts from a clean DB. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
