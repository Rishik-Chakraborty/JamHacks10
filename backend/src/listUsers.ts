// listUsers.ts – run with `npx tsx src/listUsers.ts`
import mongoose from 'mongoose';
import { UserModel } from './models/User';
import { ChallengeModel } from './models/Challenge';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('\n=== USERS ===');
  const users = await UserModel.find({}).lean();
  users.forEach(u => console.log(JSON.stringify({ username: u.username, wallet: u.wallet, isCreator: u.isCreator, noShows: u.noShows })));

  console.log('\n=== CHALLENGES ===');
  const challenges = await ChallengeModel.find({}).lean();
  challenges.forEach(c => console.log(JSON.stringify({
    title: c.title,
    status: c.status,
    creatorWallet: c.creatorWallet,
    challengerWallet: c.challengerWallet,
    yesPool: c.yesPoolLamports,
    noPool: c.noPoolLamports,
    hypeScore: c.hypeScore,
    streak: c.streak,
    misses: c.misses,
  })));

  await mongoose.disconnect();
}

main().catch(console.error);
