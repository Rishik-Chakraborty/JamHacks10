/**
 * MongoDB connection (mongoose) + GridFS bucket accessor for large photos.
 * GridFSBucket is taken from mongoose's bundled `mongo` so the driver types match.
 */
import mongoose from 'mongoose';
import { env } from './env';

type Bucket = InstanceType<typeof mongoose.mongo.GridFSBucket>;

let bucket: Bucket | null = null;

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongo connection has no db handle');
  bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'photos' });
  console.log('✅ MongoDB connected');
}

/** GridFS bucket for storing/streaming large photo blobs. */
export function getBucket(): Bucket {
  if (!bucket) throw new Error('GridFS bucket not initialized — call connectDb() first');
  return bucket;
}

export { mongoose };
