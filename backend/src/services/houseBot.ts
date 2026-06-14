/**
 * House bot (demo) — seeds a small counter-bet on a freshly-opened market so it's
 * never one-sided (100-0). Without this, a line where everyone backs one side has
 * an empty losing pool, so `claim_winnings` only refunds stake (no real winnings)
 * and the odds read a flat 100%. The bot bets the *underdog* side a fraction of
 * the seed, landing the favorite at a realistic, non-round split (~62-69%).
 *
 * Best-effort: places the bet ON-CHAIN (signed by the authority) so winners have a
 * real losing pool to claim from; if the chain call fails it falls back to a
 * MongoDB-only mirror so at least the displayed odds are two-sided. Idempotent —
 * runs at most once per line.
 */
import { ChallengeModel, challengeToDTO } from '../models/Challenge';
import { BetModel } from '../models/Bet';
import { env } from '../config/env';
import { placeBotBet, getBotWallet } from './solana';

/** Resolve the bot's wallet label (real authority pubkey when Solana is on). */
function botWallet(): string {
  if (env.solanaEnabled) {
    try {
      return getBotWallet();
    } catch {
      /* fall through to label */
    }
  }
  return 'HOUSE_BOT';
}

export async function seedHouseBet(challengeId: string): Promise<void> {
  const challenge = await ChallengeModel.findById(challengeId);
  if (!challenge) return;

  const wallet = botWallet();

  // Idempotent: never double-seed a line.
  const already = await BetModel.findOne({ challengeId: challenge._id, bettorWallet: wallet });
  if (already) return;

  const yes = challenge.yesPoolLamports ?? 0;
  const no = challenge.noPoolLamports ?? 0;

  // Bet the underdog (opposite the seeded side) so the favorite lands ~62-69%.
  const seedSide: 'yes' | 'no' = yes >= no ? 'yes' : 'no';
  const counter: 'yes' | 'no' = seedSide === 'yes' ? 'no' : 'yes';
  const seedAmount = Math.max(yes, no) || 50_000_000; // default 0.05 SOL if no seed
  const frac = 0.45 + Math.random() * 0.17; // underdog ≈ 45-62% of the favorite → non-round %
  const amount = Math.max(10_000_000, Math.round(seedAmount * frac)); // ≥ 0.01 SOL

  // On-chain counter-bet (best-effort) so the losing pool is real → claim pays out.
  let txSig = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  let positionPda = `botpos_${challenge._id.toString()}`;
  if (env.solanaEnabled && challenge.marketPda) {
    try {
      const res = await placeBotBet(challengeToDTO(challenge), counter, amount);
      txSig = res.txSig;
      positionPda = res.positionPda;
    } catch (err) {
      console.warn(
        `[housebot] on-chain bet failed for ${challengeId} (using web2 mirror): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Mirror to MongoDB so the displayed pools/odds are two-sided.
  try {
    await BetModel.create({
      challengeId: challenge._id,
      bettorWallet: wallet,
      side: counter,
      amountLamports: amount,
      txSig,
      positionPda,
      claimed: false,
    });
    const poolField = counter === 'yes' ? 'yesPoolLamports' : 'noPoolLamports';
    const updated = await ChallengeModel.findByIdAndUpdate(
      challenge._id,
      { $inc: { [poolField]: amount } },
      { new: true },
    );
    if (updated) {
      const total = updated.yesPoolLamports + updated.noPoolLamports;
      updated.impliedYes = total > 0 ? updated.yesPoolLamports / total : 0.5;
      await updated.save();
    }
  } catch (err) {
    console.warn(
      `[housebot] mongo mirror failed for ${challengeId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
