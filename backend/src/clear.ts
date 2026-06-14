import { connectDb, mongoose } from './config/db';
import { UserModel } from './models/User';
import { ChallengeModel } from './models/Challenge';
import { PhotoModel } from './models/Photo';
import { MetricModel } from './models/Metric';
import { BetModel } from './models/Bet';
import { CommentModel } from './models/Comment';
import { FollowModel } from './models/Follow';

async function clearDb() {
  await connectDb();
  console.log('🧹 Clearing all collections from MongoDB…');

  await Promise.all([
    UserModel.deleteMany({}),
    ChallengeModel.deleteMany({}),
    PhotoModel.deleteMany({}),
    MetricModel.deleteMany({}),
    BetModel.deleteMany({}),
    CommentModel.deleteMany({}),
    FollowModel.deleteMany({}),
  ]);

  console.log('✅ Database cleared successfully.');
  await mongoose.disconnect();
  process.exit(0);
}

clearDb().catch((err) => {
  console.error('Failed to clear database:', err);
  process.exit(1);
});
