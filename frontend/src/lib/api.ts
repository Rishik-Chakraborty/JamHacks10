/**
 * Typed REST client for the GymCast backend.
 * All request/response shapes come from the shared contract (`@/types/contract`).
 */
import type {
  User,
  Challenge,
  ChallengeDetail,
  Photo,
  Bet,
  Comment,
  Odds,
  PortfolioPosition,
  FeedPost,
  Profile,
  LikeResult,
  CreateUserBody,
  CreateChallengeBody,
  AttachMarketBody,
  CreatePhotoBody,
  CreateBetBody,
  CreateCommentBody,
  ResolveChallengeBody,
  ResolveChallengeResponse,
} from '@/types/contract';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // users
  createUser: (body: CreateUserBody) => request<User>('/users', { method: 'POST', body: JSON.stringify(body) }),
  /** Upsert by wallet — also used to edit your own profile. */
  updateProfile: (body: CreateUserBody) => request<User>('/users', { method: 'POST', body: JSON.stringify(body) }),
  searchUsers: (q: string) => request<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
  getUser: (wallet: string) => request<User>(`/users/${wallet}`),
  getPositions: (wallet: string) => request<PortfolioPosition[]>(`/users/${wallet}/positions`),
  getProfile: (wallet: string, viewer?: string) =>
    request<Profile>(`/users/${wallet}/profile${viewer ? `?viewer=${viewer}` : ''}`),

  // social feed
  getFeed: (wallet?: string) => request<FeedPost[]>(`/feed${wallet ? `?wallet=${wallet}` : ''}`),
  toggleLike: (photoId: string, wallet: string) =>
    request<LikeResult>(`/photos/${photoId}/like`, { method: 'POST', body: JSON.stringify({ wallet }) }),

  // challenges
  listChallenges: () => request<Challenge[]>('/challenges'),
  createChallenge: (body: CreateChallengeBody) =>
    request<Challenge>('/challenges', { method: 'POST', body: JSON.stringify(body) }),
  getChallenge: (id: string) => request<ChallengeDetail>(`/challenges/${id}`),
  attachMarket: (id: string, body: AttachMarketBody) =>
    request<Challenge>(`/challenges/${id}/market`, { method: 'POST', body: JSON.stringify(body) }),
  resolveChallenge: (id: string, body: ResolveChallengeBody = {}) =>
    request<ResolveChallengeResponse>(`/challenges/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) }),
  getOdds: (id: string) => request<Odds>(`/challenges/${id}/odds`),

  // photos
  listPhotos: (challengeId: string) => request<Photo[]>(`/challenges/${challengeId}/photos`),
  createPhoto: (body: CreatePhotoBody) => request<Photo>('/photos', { method: 'POST', body: JSON.stringify(body) }),

  // bets
  listBets: (challengeId: string) => request<Bet[]>(`/challenges/${challengeId}/bets`),
  createBet: (body: CreateBetBody) => request<Bet>('/bets', { method: 'POST', body: JSON.stringify(body) }),

  // comments
  listComments: (challengeId: string) => request<Comment[]>(`/challenges/${challengeId}/comments`),
  createComment: (body: CreateCommentBody) =>
    request<Comment>('/comments', { method: 'POST', body: JSON.stringify(body) }),
};
