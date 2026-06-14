// clearRyanAndChallenger.ts – run with `npx tsx src/clearRyanAndChallenger.ts`
import mongoose from 'mongoose';
import { UserModel } from './models/User';
import { ChallengeModel } from './models/Challenge';
import { BetModel } from './models/Bet';
import { PhotoModel } from './models/Photo';
import { CommentModel } from './models/Comment';
import { MetricModel } from './models/Metric';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

// All wallets belonging to rishik + challenger accounts
const WALLETS = [
  'AUjmf2vZcoHP5yn3s2eWTjnQnoEzjZNMm5iv78qE8vhp', // rishik
  'DQyBuY6kmXa7CTExvSPEThnHx5akEDqxFTTGKyt2N3d9', // RISHIKINFLUENCER
  '3N5G3Jq1FhB7JMN76m4yeqaUPXhmxDiBg9J4gdBrCKV5', // Challengerr
  'GuCm1CpjwWVYejEkLJkfZAioue3cXhxoSDAwsX7NAx5U', // CHALLENGER
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB\n');

  // 1. Delete user documents
  const userDel = await UserModel.deleteMany({ wallet: { $in: WALLETS } });
  console.log(`Users deleted: ${userDel.deletedCount}`);

  // 2. Delete all challenges where ANY of these wallets is creator OR challenger
  const challengeDel = await ChallengeModel.deleteMany({
    $or: [
      { creatorWallet: { $in: WALLETS } },
      { challengerWallet: { $in: WALLETS } },
    ],
  });
  console.log(`Challenges deleted: ${challengeDel.deletedCount}`);

  // 3. Delete bets placed by any of these wallets
  const betDel = await BetModel.deleteMany({ bettor: { $in: WALLETS } });
  console.log(`Bets deleted: ${betDel.deletedCount}`);

  // 4. Delete photos uploaded by any of these wallets
  const photoDel = await PhotoModel.deleteMany({ uploaderWallet: { $in: WALLETS } });
  console.log(`Photos deleted: ${photoDel.deletedCount}`);

  // 5. Delete comments by any of these wallets
  const commentDel = await CommentModel.deleteMany({ authorWallet: { $in: WALLETS } });
  console.log(`Comments deleted: ${commentDel.deletedCount}`);

  // 6. Delete metrics for any of these wallets
  const metricDel = await MetricModel.deleteMany({ wallet: { $in: WALLETS } });
  console.log(`Metrics deleted: ${metricDel.deletedCount}`);

  await mongoose.disconnect();
  console.log('\nDone – all rishik + challenger data cleared.');
}

main().catch(console.error);
