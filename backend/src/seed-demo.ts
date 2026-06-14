/**
 * Demo seeder — realistic-looking (FAKE) creators + social feed for the demo.
 * Run:  npx tsx src/seed-demo.ts
 *
 * Images: LoremFlickr (keyword fitness photos) + pravatar (face avatars).
 * Idempotent: clears these creators' data first, then re-inserts.
 */
import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { UserModel } from './models/User';
import { PhotoModel } from './models/Photo';
import { FollowModel } from './models/Follow';
import { ChallengeModel } from './models/Challenge';

const SOL = 1_000_000_000;
const img = (kw: string, lock: number) => `https://loremflickr.com/600/600/${kw}?lock=${lock}`;
const avatar = (n: number) => `https://i.pravatar.cc/200?img=${n}`;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

// Fixed wallets so re-running is idempotent.
const W = {
  sam: 'tw3nNBNJ9WBK2YdZKXxNKD69d8taWepgMnXebkmVtX4',
  benny: 'AdRiNaizoWhisTP17YKwV8HxyjFmDQmA8VFadieuRHQL',
  lena: 'EWCqYcgAqZTdbynwYXLpFKpRL3GRYht4yriYCuJGDPg2',
  dan: '33amdYyx3n2zBjAV7929ujuDjmv54sUsYKKo5SPsmcCe',
  carla: '7gh7GBnjiYTjRwzNkxAXMADQJd6246u8SUWx2kcjdRJB',
  kai: 'H74njHXkA7CtQaHVV8dcufwETHB1dmKZYCDDTjPKVBtp',
  challenger: 'DJ82rxvfzUGpDFy7rCyU9t6PBLUgvXdoGo3sBEhJZM65',
};
const CREATORS = [W.sam, W.benny, W.lena, W.dan, W.carla, W.kai];

/** Deterministic synthetic follower wallets (valid base58 chars). */
const fakeFollower = (i: number) =>
  ('Fan' + i.toString().padStart(2, '0')).padEnd(44, 'q1W2e3R4t5Y6u7I8o9P0aSdFgHjKlZxCvBnM');

async function main() {
  await connectDb();

  // ---- Clean prior demo data ------------------------------------------------
  await Promise.all([
    UserModel.deleteMany({ wallet: { $in: CREATORS } }),
    PhotoModel.deleteMany({ authorWallet: { $in: CREATORS } }),
    FollowModel.deleteMany({ $or: [{ following: { $in: CREATORS } }, { follower: { $in: CREATORS } }] }),
    ChallengeModel.deleteMany({ creatorWallet: { $in: CREATORS } }),
  ]);

  // ---- Creators -------------------------------------------------------------
  await UserModel.create([
    { wallet: W.sam, username: 'ShreddedSam', bio: 'Natty & chasing single-digit body fat. Cut diary, daily. 🥦', avatar: avatar(11), isCreator: true },
    { wallet: W.benny, username: 'BulkBenny', bio: 'Eat big, lift big. Bulking season never ends. 🍚', avatar: avatar(12), isCreator: true },
    { wallet: W.lena, username: 'LeanLena', bio: 'Skinny → strong. Calisthenics & coffee. ☕', avatar: avatar(5), isCreator: true },
    { wallet: W.dan, username: 'DeadliftDan', bio: '405 or bust. Powerlifting, PRs & plates.', avatar: avatar(14), isCreator: true },
    { wallet: W.carla, username: 'CardioCarla', bio: 'Marathon #4 loading. Run the city. 🏃‍♀️', avatar: avatar(9), isCreator: true },
    { wallet: W.kai, username: 'CalisthenicsKai', bio: 'Bars are my gym. Chasing the planche. 🤸', avatar: avatar(33), isCreator: true },
  ]);

  // ---- Standalone posts (the Instagram feed) --------------------------------
  type P = { w: string; kw: string; lock: number; caption: string; d: number; likes: number };
  const posts: P[] = [
    { w: W.sam, kw: 'fitness,abs', lock: 11, caption: 'Week 6 of the cut. Abs finally showing in this light. 🔪', d: 0.2, likes: 41 },
    { w: W.sam, kw: 'gym,fitness', lock: 12, caption: 'Fasted cardio before work. The grind is silent.', d: 2, likes: 22 },
    { w: W.sam, kw: 'shredded', lock: 13, caption: 'Before vs now — 14% to 9% body fat. Patience pays.', d: 5, likes: 88 },
    { w: W.benny, kw: 'bodybuilder', lock: 14, caption: 'Up 6kg this bulk. Chest day hits different. 🐂', d: 0.5, likes: 53 },
    { w: W.benny, kw: 'muscle,gym', lock: 15, caption: 'Mass-monomer szn. Bench moving up every week.', d: 3, likes: 31 },
    { w: W.benny, kw: 'gym', lock: 16, caption: 'Form check on incline. Slow eccentrics = gains.', d: 6, likes: 27 },
    { w: W.lena, kw: 'fitness,woman', lock: 17, caption: 'First unassisted pull-up!! Calisthenics journey 🧗‍♀️', d: 0.8, likes: 64 },
    { w: W.lena, kw: 'workout', lock: 18, caption: 'Went from couch to 3 sets of dips. Consistency > motivation.', d: 4, likes: 39 },
    { w: W.dan, kw: 'barbell,gym', lock: 19, caption: '180kg x1 today. 200 is loading. 🔒', d: 0.3, likes: 72 },
    { w: W.dan, kw: 'deadlift', lock: 20, caption: 'Belt on, chalk up. PR attempt this weekend.', d: 2.5, likes: 45 },
    { w: W.carla, kw: 'running', lock: 21, caption: '18km long run done before sunrise. Legs are jelly. 🌅', d: 1, likes: 36 },
    { w: W.carla, kw: 'runner,marathon', lock: 22, caption: 'New 10k PB — 41:12. The hills paid off.', d: 4.5, likes: 51 },
    { w: W.kai, kw: 'calisthenics', lock: 23, caption: 'Tuck planche hold creeping up. 8s and counting.', d: 0.6, likes: 58 },
    { w: W.kai, kw: 'workout,pullup', lock: 24, caption: 'Muscle-up reps for days. Bars > everything.', d: 3.2, likes: 43 },
    { w: W.sam, kw: 'fitness', lock: 25, caption: 'Meal prep Sunday. 200g protein, no excuses.', d: 7, likes: 19 },
    { w: W.benny, kw: 'bodybuilder,muscle', lock: 26, caption: 'Back width is coming in. Rows never lie.', d: 8, likes: 33 },
  ];

  const photoDocs = posts.map((p) => ({
    authorWallet: p.w,
    capturedAt: daysAgo(p.d),
    imageData: img(p.kw, p.lock),
    mimeType: 'image/jpeg',
    caption: p.caption,
    isFinal: false,
    likes: Array.from({ length: Math.min(p.likes, 8) }, (_, i) => fakeFollower(i)),
  }));
  await PhotoModel.insertMany(photoDocs);

  // ---- Follows: cross-follows + synthetic followers for the badge -----------
  const followDocs: { follower: string; following: string }[] = [];
  // Cross-follows among creators.
  for (const a of CREATORS) for (const b of CREATORS) if (a !== b && Math.random() < 0.5) followDocs.push({ follower: a, following: b });
  // Push Sam + Benny + Lena over the creator-program threshold (10).
  for (const star of [W.sam, W.benny, W.lena]) {
    for (let i = 0; i < 14; i++) followDocs.push({ follower: fakeFollower(i + 100 + CREATORS.indexOf(star) * 20), following: star });
  }
  await FollowModel.insertMany(followDocs, { ordered: false }).catch(() => {});

  // ---- Two active LINES with attached progress posts (feed line-below) -------
  const line1 = await ChallengeModel.create({
    creatorWallet: W.dan, challengerWallet: W.challenger,
    title: 'Deadlift 200 kg', goalText: 'Pull a 200 kg deadlift for a clean single before the deadline.',
    successCriteria: 'A video shows one full deadlift rep to lockout with plates summing to 200 kg including the bar.',
    metricUnit: 'kg', templateId: 'deadlift',
    startDate: daysAgo(3), deadline: new Date(Date.now() + 9 * 86_400_000), status: 'active',
    creatorFeeBps: 500, platformFeeBps: 250, outcome: null,
    yesPoolLamports: 2.6 * SOL, noPoolLamports: 1.4 * SOL, impliedYes: 0.65, hypeScore: 74, streak: 4, misses: 1,
  });
  const line2 = await ChallengeModel.create({
    creatorWallet: W.kai, challengerWallet: W.challenger,
    title: 'Freestanding handstand for 60s', goalText: 'Balance a freestanding handstand for 60 seconds.',
    successCriteria: 'A single continuous video shows a freestanding handstand held ≥60s with a visible timer.',
    metricUnit: 'sec', templateId: 'handstand',
    startDate: daysAgo(2), deadline: new Date(Date.now() + 6 * 86_400_000), status: 'active',
    creatorFeeBps: 500, platformFeeBps: 250, outcome: null,
    yesPoolLamports: 1.1 * SOL, noPoolLamports: 2.3 * SOL, impliedYes: 0.32, hypeScore: 61, streak: 2, misses: 0,
  });

  await PhotoModel.insertMany([
    { authorWallet: W.dan, challengeId: line1._id, capturedAt: daysAgo(0.4), imageData: img('deadlift,gym', 30), mimeType: 'image/jpeg', caption: 'Progress on the 200 line — 185 x1 felt smooth. Bettors, hold YES. 🔥', isFinal: false, likes: [fakeFollower(1), fakeFollower(2), fakeFollower(3)] },
    { authorWallet: W.kai, challengeId: line2._id, capturedAt: daysAgo(0.7), imageData: img('calisthenics,workout', 31), mimeType: 'image/jpeg', caption: '40s freestanding today. The NO side is sweating. 🤸', isFinal: false, likes: [fakeFollower(4), fakeFollower(5)] },
  ]);

  const users = await UserModel.countDocuments({ wallet: { $in: CREATORS } });
  const photos = await PhotoModel.countDocuments({ authorWallet: { $in: CREATORS } });
  console.log(`✅ Demo seed: ${users} creators, ${photos} posts, 2 active lines, follows wired.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error('seed-demo failed:', e); process.exit(1); });
