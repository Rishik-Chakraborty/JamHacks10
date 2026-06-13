/**
 * Demo seed script — populates MongoDB with users, challenges, photos, metrics,
 * bets, and comments so the app is lively without manual entry.
 *
 * Run: `npm run seed` (needs MONGODB_URI set in backend/.env).
 *
 * Seeded challenges have NO marketPda, so the on-chain bet/claim UI shows its
 * "market not live yet" state — but the feed, odds bars, Hype Meter, progress
 * charts, photo gallery, comments, mirrored bets, and live ticker all work.
 */
import { connectDb, mongoose } from './config/db';
import { UserModel } from './models/User';
import { ChallengeModel } from './models/Challenge';
import { PhotoModel } from './models/Photo';
import { MetricModel } from './models/Metric';
import { BetModel } from './models/Bet';
import { CommentModel } from './models/Comment';
import { LAMPORTS_PER_SOL } from './contract';

const sol = (n: number) => Math.round(n * LAMPORTS_PER_SOL);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

/** Tiny inline SVG "progress photo" so the gallery renders without real uploads. */
function fakePhoto(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="hsl(${hue} 70% 18%)"/>
    <circle cx="200" cy="160" r="70" fill="hsl(${hue} 80% 55%)"/>
    <text x="200" y="320" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function seed() {
  await connectDb();
  console.log('🌱 Seeding GymCast demo data…');

  await Promise.all([
    UserModel.deleteMany({}),
    ChallengeModel.deleteMany({}),
    PhotoModel.deleteMany({}),
    MetricModel.deleteMany({}),
    BetModel.deleteMany({}),
    CommentModel.deleteMany({}),
  ]);

  const W = {
    bro: '7gymBRoXq1Z2k9veInPump4xWdEhTfLmNoPqRsTuVwXy',
    whale: '9wha1Ek2Lm3No4Pq5Rs6Tu7Vw8Xy9Za1Bc2De3Fg4H',
    skeptic: '4skEpT1c2D3f4G5h6J7k8L9m0N1p2Q3r4S5t6U7v8W9',
  };

  await UserModel.create([
    { wallet: W.bro, username: 'GymBroGreg', bio: 'Chasing the vein. Doubt me.' },
    { wallet: W.whale, username: 'SolWhale', bio: 'I back discipline.' },
    { wallet: W.skeptic, username: 'FudFred', bio: 'He will fold by week 2.' },
  ]);

  // --- Challenge 1: active, visual goal, YES-favored -------------------------
  const yes1 = sol(2.5);
  const no1 = sol(1.5);
  const c1 = await ChallengeModel.create({
    creatorWallet: W.bro,
    title: 'Visible bicep vein by month end',
    goalText: 'Greg will have a clearly visible bicep vein (cephalic vein) when flexed.',
    successCriteria:
      'A distinct, raised vein is clearly visible along the front of the flexed upper arm in good lighting, unobstructed.',
    metricType: 'visual',
    startDate: daysFromNow(-6),
    deadline: daysFromNow(14),
    status: 'active',
    yesPoolLamports: yes1,
    noPoolLamports: no1,
    impliedYes: yes1 / (yes1 + no1),
    hypeScore: 72,
    streak: 5,
    misses: 1,
    lastPostAt: daysFromNow(-0.4),
  });

  await PhotoModel.create([
    { challengeId: c1._id, capturedAt: daysFromNow(-5), imageData: fakePhoto('Day 1', 280), mimeType: 'image/svg+xml', isFinal: false },
    { challengeId: c1._id, capturedAt: daysFromNow(-3), imageData: fakePhoto('Day 3', 300), mimeType: 'image/svg+xml', isFinal: false },
    { challengeId: c1._id, capturedAt: daysFromNow(-0.4), imageData: fakePhoto('Day 6', 320), mimeType: 'image/svg+xml', isFinal: false },
  ]);

  await BetModel.create([
    { challengeId: c1._id, bettorWallet: W.whale, side: 'yes', amountLamports: sol(2.0), txSig: 'seedSig_c1_whale_yes', positionPda: 'seedPos_c1_whale' },
    { challengeId: c1._id, bettorWallet: W.skeptic, side: 'no', amountLamports: sol(1.5), txSig: 'seedSig_c1_skeptic_no', positionPda: 'seedPos_c1_skeptic' },
    { challengeId: c1._id, bettorWallet: W.bro, side: 'yes', amountLamports: sol(0.5), txSig: 'seedSig_c1_bro_yes', positionPda: 'seedPos_c1_bro' },
  ]);

  await CommentModel.create([
    { challengeId: c1._id, wallet: W.skeptic, type: 'skull', body: 'No chance. Folding by week 2.' },
    { challengeId: c1._id, wallet: W.whale, type: 'muscle', body: 'Locked in. Easy money.' },
  ]);

  // --- Challenge 2: active, bench PR with rising metric, NO-favored ----------
  const yes2 = sol(4);
  const no2 = sol(6);
  const c2 = await ChallengeModel.create({
    creatorWallet: W.bro,
    title: 'Bench press 100kg by August',
    goalText: 'Greg will bench press 100kg for one clean rep.',
    successCriteria: 'A single full-range 100kg barbell bench rep on video with a visible plate count.',
    metricType: 'bench',
    startDate: daysFromNow(-20),
    deadline: daysFromNow(30),
    status: 'active',
    yesPoolLamports: yes2,
    noPoolLamports: no2,
    impliedYes: yes2 / (yes2 + no2),
    hypeScore: 58,
    streak: 3,
    misses: 2,
    lastPostAt: daysFromNow(-1),
  });

  await MetricModel.create(
    [82, 84, 85, 87, 88, 90, 91].map((value, i) => ({
      challengeId: c2._id,
      ts: daysFromNow(-20 + i * 3),
      metricType: 'bench' as const,
      value,
    })),
  );
  await PhotoModel.create([
    { challengeId: c2._id, capturedAt: daysFromNow(-2), imageData: fakePhoto('90kg x1', 200), mimeType: 'image/svg+xml', metricValue: 90, isFinal: false },
  ]);
  await BetModel.create([
    { challengeId: c2._id, bettorWallet: W.skeptic, side: 'no', amountLamports: sol(6), txSig: 'seedSig_c2_skeptic_no', positionPda: 'seedPos_c2_skeptic' },
    { challengeId: c2._id, bettorWallet: W.whale, side: 'yes', amountLamports: sol(4), txSig: 'seedSig_c2_whale_yes', positionPda: 'seedPos_c2_whale' },
  ]);

  // --- Challenge 3: resolved YES, weight-loss with falling metric -----------
  const yes3 = sol(3);
  const no3 = sol(3);
  const c3 = await ChallengeModel.create({
    creatorWallet: W.bro,
    title: 'Cut to 75kg bodyweight',
    goalText: 'Greg will reach 75kg bodyweight.',
    successCriteria: 'Scale photo reading 75.0kg or below with face in frame.',
    metricType: 'weight',
    startDate: daysFromNow(-40),
    deadline: daysFromNow(-1),
    status: 'resolved',
    outcome: 'yes',
    yesPoolLamports: yes3,
    noPoolLamports: no3,
    impliedYes: 0.5,
    hypeScore: 88,
    streak: 12,
    misses: 0,
    lastPostAt: daysFromNow(-1),
  });
  await MetricModel.create(
    [82, 81, 80, 78.5, 77, 76, 74.8].map((value, i) => ({
      challengeId: c3._id,
      ts: daysFromNow(-40 + i * 6),
      metricType: 'weight' as const,
      value,
    })),
  );
  await PhotoModel.create([
    { challengeId: c3._id, capturedAt: daysFromNow(-1.1), imageData: fakePhoto('74.8kg', 140), mimeType: 'image/svg+xml', metricValue: 74.8, isFinal: true },
  ]);
  await BetModel.create([
    { challengeId: c3._id, bettorWallet: W.whale, side: 'yes', amountLamports: sol(3), txSig: 'seedSig_c3_whale_yes', positionPda: 'seedPos_c3_whale', claimed: true },
    { challengeId: c3._id, bettorWallet: W.skeptic, side: 'no', amountLamports: sol(3), txSig: 'seedSig_c3_skeptic_no', positionPda: 'seedPos_c3_skeptic' },
  ]);

  const counts = {
    users: await UserModel.countDocuments(),
    challenges: await ChallengeModel.countDocuments(),
    photos: await PhotoModel.countDocuments(),
    metrics: await MetricModel.countDocuments(),
    bets: await BetModel.countDocuments(),
    comments: await CommentModel.countDocuments(),
  };
  console.log('✅ Seed complete:', counts);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
