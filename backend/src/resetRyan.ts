// resetRyan.ts – run with `npx tsx src/resetRyan.ts`
import mongoose from 'mongoose';
import { UserModel } from './models/User';
import { ChallengeModel } from './models/Challenge';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Find user by username (case‑insensitive) = "ryan"
  const user = await UserModel.findOne({ username: { $regex: '^ryan$', $options: 'i' } });
  if (!user) {
    console.warn('User "ryan" not found');
  } else {
    await UserModel.updateOne({ _id: user._id }, { $set: { isCreator: false, noShows: 0 } });
    console.log(`User ${user.username} (${user.wallet}) reset`);
  }

  // Helper to build update object for Challenge numeric defaults
  const challengeDefaults = {
    yesPoolLamports: 0,
    noPoolLamports: 0,
    impliedYes: 0.5,
    hypeScore: 0,
    streak: 0,
    misses: 0,
    likes: [],
    // optional: reset outcome related fields if desired
    outcome: null,
    proposedOutcome: null,
    verdict: null,
  };

  // Reset challenges where Ryan is the challenger
  const challengerFilter = user ? { challengerWallet: user.wallet } : {};
  const challengerResult = await ChallengeModel.updateMany(challengerFilter, { $set: challengeDefaults });
  console.log(`Challenges (challenger) matched: ${challengerResult.nModified}`);

  // Reset challenges where Ryan is the creator (optional)
  const creatorFilter = user ? { creatorWallet: user.wallet } : {};
  const creatorResult = await ChallengeModel.updateMany(creatorFilter, { $set: challengeDefaults });
  console.log(`Challenges (creator) matched: ${creatorResult.nModified}`);

  await mongoose.disconnect();
  console.log('MongoDB connection closed');
}

main().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
