import { Types } from 'mongoose';
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { BetModel, betToDTO } from '../models/Bet';
import { HttpError } from '../middleware/error';
import { computeOdds, quoteParimutuelPayout } from './odds';
import { emitHype, emitTicker } from '../realtime';
import { buildHypeUpdate } from './hype';
import type { Bet, BetSide } from '../contract';
import { LAMPORTS_PER_SOL } from '../contract';

const LOCK_WINDOW_MS = 12 * 60 * 60 * 1000;
const MAX_BOTS_PER_CALL = 12;
const DEFAULT_BOT_COUNT = 5;
const DEMO_FEE_RATE = 0.075;

const BOT_WALLETS = [
  'bot_momentum_max',
  'bot_value_viv',
  'bot_fade_finn',
  'bot_hype_hana',
  'bot_skeptic_sam',
  'bot_oracle_ollie',
] as const;

type Strategy = 'momentum' | 'value' | 'fade' | 'balanced';

export interface DemoBotRun {
  challengeId: string;
  lockWindowHours: number;
  before: ReturnType<typeof computeOdds>;
  after: ReturnType<typeof computeOdds>;
  bets: Bet[];
}

function clampBotCount(count: number | undefined): number {
  if (!Number.isFinite(count)) return DEFAULT_BOT_COUNT;
  return Math.max(1, Math.min(MAX_BOTS_PER_CALL, Math.floor(count ?? DEFAULT_BOT_COUNT)));
}

function chooseStrategy(index: number): Strategy {
  const strategies: Strategy[] = ['momentum', 'value', 'fade', 'balanced'];
  return strategies[index % strategies.length];
}

function chooseSide(strategy: Strategy, impliedYes: number, hypeScore: number): BetSide {
  switch (strategy) {
    case 'momentum':
      return hypeScore >= 55 || impliedYes >= 0.5 ? 'yes' : 'no';
    case 'value':
      return impliedYes < 0.48 ? 'yes' : 'no';
    case 'fade':
      return impliedYes > 0.62 ? 'no' : 'yes';
    default:
      return impliedYes >= 0.5 ? 'yes' : 'no';
  }
}

function stakeForBot(index: number, strategy: Strategy): number {
  const baseSol = strategy === 'value' ? 0.18 : strategy === 'momentum' ? 0.14 : 0.1;
  const ladderSol = (index % 4) * 0.035;
  return Math.round((baseSol + ladderSol) * LAMPORTS_PER_SOL);
}

function txSig(challengeId: string, index: number): string {
  return `demo-bot-${challengeId}-${Date.now()}-${index}`;
}

/**
 * Simulate bettors for demos without touching Solana.
 *
 * These are still real MongoDB mirror bets, so the existing parimutuel odds,
 * ticker, challenge detail, portfolio joins, and Change Stream updates all see
 * the same shape they would see after on-chain bet mirroring.
 */
export async function runDemoBots(challengeId: string, count?: number): Promise<DemoBotRun> {
  if (!Types.ObjectId.isValid(challengeId)) throw new HttpError(400, 'Invalid challenge id');

  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) throw new HttpError(404, 'Challenge not found');
  if (challenge.status !== 'active') throw new HttpError(409, 'Demo bots only bet on active markets');

  const msToDeadline = challenge.deadline.getTime() - Date.now();
  if (msToDeadline <= LOCK_WINDOW_MS) {
    throw new HttpError(409, 'Betting is locked inside the 12-hour pre-deadline window');
  }

  const before = computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports);
  const created: Bet[] = [];
  const botCount = clampBotCount(count);

  for (let i = 0; i < botCount; i += 1) {
    const liveOdds = computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports);
    const strategy = chooseStrategy(i);
    const side = chooseSide(strategy, liveOdds.impliedYes, challenge.hypeScore);
    const amountLamports = stakeForBot(i, strategy);
    const quote = quoteParimutuelPayout({
      side,
      stakeLamports: amountLamports,
      yesPoolLamports: side === 'yes' ? challenge.yesPoolLamports + amountLamports : challenge.yesPoolLamports,
      noPoolLamports: side === 'no' ? challenge.noPoolLamports + amountLamports : challenge.noPoolLamports,
      feeRate: DEMO_FEE_RATE,
    });

    const doc = await BetModel.create({
      challengeId: challenge._id,
      bettorWallet: BOT_WALLETS[i % BOT_WALLETS.length],
      side,
      amountLamports,
      txSig: txSig(challengeId, i),
      positionPda: `demo-position-${challengeId}-${i}`,
      claimed: false,
    });

    if (side === 'yes') challenge.yesPoolLamports += amountLamports;
    else challenge.noPoolLamports += amountLamports;
    challenge.hypeScore = Math.min(100, challenge.hypeScore + 2);

    emitTicker({
      kind: 'bet',
      challengeId,
      challengeTitle: challenge.title,
      wallet: doc.bettorWallet,
      side,
      amountLamports,
      message: `${strategy} bot backed ${side.toUpperCase()} at ${quote.multiplier?.toFixed(2) ?? '1.00'}x projected payout`,
      at: new Date().toISOString(),
    });

    created.push(betToDTO(doc));
  }

  const total = challenge.yesPoolLamports + challenge.noPoolLamports;
  challenge.impliedYes = total > 0 ? challenge.yesPoolLamports / total : 0.5;
  await challenge.save();

  const after = computeOdds(challenge.yesPoolLamports, challenge.noPoolLamports);
  const dto = challengeToDTO(challenge);
  emitHype(buildHypeUpdate({ ...dto, betCountRecent: botCount }, after));

  return {
    challengeId,
    lockWindowHours: LOCK_WINDOW_MS / (60 * 60 * 1000),
    before,
    after,
    bets: created,
  };
}
