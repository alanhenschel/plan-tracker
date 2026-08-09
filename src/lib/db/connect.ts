import mongoose, { type Mongoose } from 'mongoose';

/**
 * Serverless-safe Mongoose connection.
 *
 * On Vercel/Lambda every invocation may reuse a warm container but re-evaluate
 * module scope; without a global cache each request opens a new pool and the
 * cluster hits its connection limit ("connection storm"). We stash both the
 * resolved connection AND the in-flight promise so concurrent cold requests
 * share a single dial.
 */

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __crossvalMongoose: MongooseCache | undefined;
}

const cache: MongooseCache = global.__crossvalMongoose ?? { conn: null, promise: null };
global.__crossvalMongoose = cache;

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.');
    }

    cache.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
      })
      .catch((err) => {
        // Reset so the next request retries instead of awaiting a rejected promise forever.
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/** Test/script helper — closes the pool so the process can exit. */
export async function disconnectFromDatabase(): Promise<void> {
  if (cache.conn) {
    await cache.conn.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
}
