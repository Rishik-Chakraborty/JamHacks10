"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoose = void 0;
exports.connectDb = connectDb;
exports.getBucket = getBucket;
/**
 * MongoDB connection (mongoose) + GridFS bucket accessor for large photos.
 * GridFSBucket is taken from mongoose's bundled `mongo` so the driver types match.
 */
const mongoose_1 = __importDefault(require("mongoose"));
exports.mongoose = mongoose_1.default;
const env_1 = require("./env");
let bucket = null;
async function connectDb() {
    mongoose_1.default.set('strictQuery', true);
    await mongoose_1.default.connect(env_1.env.MONGODB_URI);
    const db = mongoose_1.default.connection.db;
    if (!db)
        throw new Error('Mongo connection has no db handle');
    bucket = new mongoose_1.default.mongo.GridFSBucket(db, { bucketName: 'photos' });
    console.log('✅ MongoDB connected');
}
/** GridFS bucket for storing/streaming large photo blobs. */
function getBucket() {
    if (!bucket)
        throw new Error('GridFS bucket not initialized — call connectDb() first');
    return bucket;
}
