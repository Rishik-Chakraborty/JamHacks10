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

/**
 * Enrich raw photo/post docs into FeedPosts. A post may be standalone (no line)
 * or attached to a line; the author comes from `authorWallet` (legacy line posts
 * fall back to the line's influencer). Batched challenge/user/comment lookups.
 */
async function buildFeedPosts(
  photos: HydratedDocument<PhotoDoc>[],
  viewerWallet?: string,
): Promise<FeedPost[]> {
  if (photos.length === 0) return [];

  const challengeObjIds = [
    ...new Set(photos.filter((p) => p.challengeId).map((p) => p.challengeId!.toString())),
  ].map((id) => new Types.ObjectId(id));

  const challenges = await ChallengeModel.find({ _id: { $in: challengeObjIds } });
  const challengeById = new Map(challenges.map((c) => [c._id.toString(), c]));

  // Author = the post's authorWallet, falling back to the attached line's influencer.
  const authorWallets = new Set<string>();
  for (const p of photos) {
    const challenge = p.challengeId ? challengeById.get(p.challengeId.toString()) : undefined;
    const author = p.authorWallet ?? challenge?.creatorWallet;
    if (author) authorWallets.add(author);
  }
  const users = await UserModel.find({ wallet: { $in: [...authorWallets] } });
  const userByWallet = new Map(users.map((u) => [u.wallet, u]));

  const commentCounts = await CommentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { challengeId: { $in: challengeObjIds } } },
    { $group: { _id: '$challengeId', n: { $sum: 1 } } },
  ]);
  const commentCountById = new Map(commentCounts.map((c) => [c._id.toString(), c.n]));

  const posts: FeedPost[] = [];
  for (const photo of photos) {
    const challenge = photo.challengeId ? challengeById.get(photo.challengeId.toString()) : undefined;
    const authorWallet = photo.authorWallet ?? challenge?.creatorWallet;
    const creator = authorWallet ? userByWallet.get(authorWallet) : undefined;
    const likes = (photo.likes ?? []) as string[];
    posts.push({
      photo: photoToDTO(photo),
      challenge: challenge ? challengeToDTO(challenge) : null,
      creator: creator ? userToDTO(creator) : null,
      likeCount: likes.length,
      likedByMe: viewerWallet ? likes.includes(viewerWallet) : false,
      commentCount: challenge ? commentCountById.get(challenge._id.toString()) ?? 0 : 0,
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
      const authorOf = (p: FeedPost) => p.photo.authorWallet ?? p.challenge?.creatorWallet ?? '';
      posts = posts.sort((a, b) => {
        const fa = following.has(authorOf(a)) ? 1 : 0;
        const fb = following.has(authorOf(b)) ? 1 : 0;
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

    // The user's own posts (standalone + line-attached they authored).
    const photos = await PhotoModel.find({ authorWallet: wallet }).sort({ createdAt: -1 });

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
