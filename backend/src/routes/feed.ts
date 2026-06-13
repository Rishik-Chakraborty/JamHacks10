/**
 * Social feed routes — the Instagram-style progress stream + likes + profiles.
 *  GET  /api/feed                    — recent progress posts across all markets (enriched)
 *  POST /api/photos/:id/like         — toggle a like (body { wallet })
 *  GET  /api/users/:wallet/profile   — a creator's lines + post grid
 *
 * Comments live on the parent challenge thread (reused), so a post's comment
 * count is that challenge's comment count.
 */
import { Router } from 'express';
import { Types, type HydratedDocument } from 'mongoose';
import { z } from 'zod';
import type { FeedPost, Profile, LikeResult } from '../contract';
import { PhotoModel, photoToDTO, type PhotoDoc } from '../models/Photo';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { UserModel, userToDTO } from '../models/User';
import { CommentModel } from '../models/Comment';
import { FollowModel, isFollowing } from '../models/Follow';
import { enrichUser } from './users';
import { computeSettlement } from '../services/payouts';
import { validateBody, asyncHandler } from '../middleware/validate';
import { HttpError } from '../middleware/error';

export const feedRouter = Router();
/** Mounted under /api/photos for the like toggle. */
export const photoLikeRouter = Router({ mergeParams: true });
/** Mounted under /api/users for the profile route. */
export const profileRouter = Router({ mergeParams: true });

function assertObjectId(id: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, `Invalid ${label} id`);
  return new Types.ObjectId(id);
}

/** Enrich raw photo docs into FeedPosts (batched challenge/user/comment lookups). */
async function buildFeedPosts(
  photos: HydratedDocument<PhotoDoc>[],
  viewerWallet?: string,
): Promise<FeedPost[]> {
  if (photos.length === 0) return [];

  const challengeIds = [...new Set(photos.map((p) => p.challengeId.toString()))];
  const objIds = challengeIds.map((id) => new Types.ObjectId(id));

  const challenges = await ChallengeModel.find({ _id: { $in: objIds } });
  const challengeById = new Map(challenges.map((c) => [c._id.toString(), c]));

  const creatorWallets = [...new Set(challenges.map((c) => c.creatorWallet))];
  const users = await UserModel.find({ wallet: { $in: creatorWallets } });
  const userByWallet = new Map(users.map((u) => [u.wallet, u]));

  const commentCounts = await CommentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { challengeId: { $in: objIds } } },
    { $group: { _id: '$challengeId', n: { $sum: 1 } } },
  ]);
  const commentCountById = new Map(commentCounts.map((c) => [c._id.toString(), c.n]));

  const posts: FeedPost[] = [];
  for (const photo of photos) {
    const challenge = challengeById.get(photo.challengeId.toString());
    if (!challenge) continue;
    const likes = (photo.likes ?? []) as string[];
    const creator = userByWallet.get(challenge.creatorWallet);
    posts.push({
      photo: photoToDTO(photo),
      challenge: challengeToDTO(challenge),
      creator: creator ? userToDTO(creator) : null,
      likeCount: likes.length,
      likedByMe: viewerWallet ? likes.includes(viewerWallet) : false,
      commentCount: commentCountById.get(photo.challengeId.toString()) ?? 0,
    });
  }
  return posts;
}

// GET /api/feed?wallet=<viewer>&limit=&skip=
feedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const viewer = typeof req.query.wallet === 'string' ? req.query.wallet : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Number(req.query.skip) || 0;

    const photos = await PhotoModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit);
    let posts = await buildFeedPosts(photos, viewer);

    // Follow-weighted ranking: posts from creators you follow float to the top,
    // recency-ordered within each group.
    if (viewer) {
      const f = await FollowModel.find({ follower: viewer }).select('following').lean();
      const following = new Set(f.map((x) => x.following));
      posts = posts.sort((a, b) => {
        const fa = following.has(a.challenge.creatorWallet) ? 1 : 0;
        const fb = following.has(b.challenge.creatorWallet) ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return new Date(b.photo.capturedAt).getTime() - new Date(a.photo.capturedAt).getTime();
      });
    }

    res.json(posts);
  }),
);

// POST /api/photos/:id/like — toggle the requesting wallet's like.
const likeSchema = z.object({ wallet: z.string().min(1) });
photoLikeRouter.post(
  '/:id/like',
  validateBody(likeSchema),
  asyncHandler(async (req, res) => {
    const _id = assertObjectId(req.params.id, 'photo');
    const { wallet } = req.body as z.infer<typeof likeSchema>;

    const photo = await PhotoModel.findById(_id);
    if (!photo) throw new HttpError(404, 'Photo not found');

    const likes = (photo.likes ?? []) as string[];
    const liked = likes.includes(wallet);
    if (liked) {
      photo.set('likes', likes.filter((w) => w !== wallet));
    } else {
      photo.set('likes', [...likes, wallet]);
    }
    await photo.save();

    const result: LikeResult = {
      photoId: photo._id.toString(),
      likeCount: (photo.get('likes') as string[]).length,
      liked: !liked,
    };
    res.json(result);
  }),
);

// GET /api/users/:wallet/profile?viewer=<wallet>
profileRouter.get(
  '/:wallet/profile',
  asyncHandler(async (req, res) => {
    const wallet = req.params.wallet;
    const viewer = typeof req.query.viewer === 'string' ? req.query.viewer : undefined;

    const user = await UserModel.findOne({ wallet });
    const challenges = await ChallengeModel.find({ creatorWallet: wallet }).sort({ createdAt: -1 });
    const challengeIds = challenges.map((c) => c._id);

    const photos =
      challengeIds.length > 0
        ? await PhotoModel.find({ challengeId: { $in: challengeIds } }).sort({ createdAt: -1 })
        : [];

    // Creator-program earnings = sum of the influencer's cut across resolved lines.
    const challengeDtos = challenges.map(challengeToDTO);
    const creatorEarningsLamports = challengeDtos
      .filter((c) => c.status === 'resolved')
      .reduce((sum, c) => sum + (computeSettlement(c)?.creatorPayoutLamports ?? 0), 0);

    const profile: Profile = {
      wallet,
      user: user ? await enrichUser(user) : null,
      challenges: challengeDtos,
      posts: await buildFeedPosts(photos, viewer),
      isFollowedByViewer: viewer ? await isFollowing(viewer, wallet) : false,
      creatorEarningsLamports,
    };
    res.json(profile);
  }),
);
