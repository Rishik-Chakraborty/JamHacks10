/**
 * Discovery — suggestion-ranked OPEN lines for the "Open Lines" page.
 *   GET /api/lines?wallet=<viewer>
 *
 * Per-viewer score blends six signals, plus an exploration slot so new/small
 * creators always get visibility (cold-start + discovery). Pure MongoDB reads +
 * in-memory scoring — leans on hypeScore (bumped by bets/photos) as the trending
 * proxy, which the realtime layer keeps fresh.
 */
import { Router } from 'express';
import type { Challenge } from '../contract';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { FollowModel } from '../models/Follow';
import { asyncHandler } from '../middleware/validate';

export const linesRouter = Router();

const WEIGHTS = { follow: 0.3, trending: 0.25, balance: 0.15, closingSoon: 0.15, liquidity: 0.1, recency: 0.05 };
const WINDOW_MS = 7 * 24 * 3_600_000; // 1 week — closing-soon + recency horizon

linesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const viewer = typeof req.query.wallet === 'string' ? req.query.wallet : undefined;

    const docs = await ChallengeModel.find({ status: 'active' }).limit(200);
    if (docs.length === 0) {
      res.json([]);
      return;
    }

    let following = new Set<string>();
    if (viewer) {
      const f = await FollowModel.find({ follower: viewer }).select('following').lean();
      following = new Set(f.map((x) => x.following));
    }

    const now = Date.now();
    const maxHype = Math.max(1, ...docs.map((d) => d.hypeScore || 0));
    const maxPool = Math.max(1, ...docs.map((d) => d.yesPoolLamports + d.noPoolLamports));

    const scored = docs.map((d) => {
      const total = d.yesPoolLamports + d.noPoolLamports;
      const impliedYes = total > 0 ? d.yesPoolLamports / total : 0.5;
      const createdMs = (d.get('createdAt') as Date).getTime();
      const msToDeadline = d.deadline.getTime() - now;

      const followAffinity = following.has(d.creatorWallet) ? 1 : 0;
      const trending = (d.hypeScore || 0) / maxHype;
      const balance = 1 - 2 * Math.abs(impliedYes - 0.5); // 1 at 50/50, 0 at the extremes
      const closingSoon = msToDeadline <= 0 ? 0 : Math.max(0, 1 - msToDeadline / WINDOW_MS);
      const liquidity = total / maxPool;
      const recency = Math.max(0, 1 - (now - createdMs) / WINDOW_MS);

      const score =
        WEIGHTS.follow * followAffinity +
        WEIGHTS.trending * trending +
        WEIGHTS.balance * balance +
        WEIGHTS.closingSoon * closingSoon +
        WEIGHTS.liquidity * liquidity +
        WEIGHTS.recency * recency;

      return { d, score, liquidity, recency };
    });

    scored.sort((a, b) => b.score - a.score);

    // Exploration slot: surface the freshest low-liquidity newcomer at position 4
    // so discovery isn't all whales. Pick from outside the top 4.
    const ranked = scored.map((s) => s.d);
    if (scored.length > 5) {
      const tail = scored.slice(4);
      const fresh = [...tail].sort((a, b) => b.recency - a.recency || a.liquidity - b.liquidity)[0];
      if (fresh) {
        const idx = ranked.indexOf(fresh.d);
        if (idx > 4) {
          ranked.splice(idx, 1);
          ranked.splice(4, 0, fresh.d);
        }
      }
    }

    res.json(
      ranked.map((d): Challenge => {
        const dto = challengeToDTO(d);
        dto.likedByMe = viewer ? (d.likes ?? []).includes(viewer) : false;
        return dto;
      }),
    );
  }),
);
