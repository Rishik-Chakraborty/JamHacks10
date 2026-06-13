/**
 * GymCast on-chain client — the only place the frontend builds & sends Anchor
 * transactions against the parimutuel market program.
 *
 * Helpers take `{ connection, wallet }` (from `useConnection()` /
 * `useAnchorWallet()`), derive PDAs via `@/lib/anchor`, and send instructions.
 * Instruction + field names are Anchor-0.30 camelCase of the Rust program
 * (`initialize_market` -> `initializeMarket`, `place_bet` -> `placeBet`,
 * `claim_winnings` -> `claimWinnings`). Side/outcome encodings mirror the
 * shared contract (`SIDE_YES`/`SIDE_NO`).
 *
 * Every helper guards on a missing program id or a disconnected wallet by
 * throwing a typed `MarketClientError` so UI can degrade gracefully.
 */
import { PublicKey, SystemProgram, type Connection } from '@solana/web3.js';
import { BN, type Idl } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  PROGRAM_ID_STR,
  getProgram,
  getProgramId,
  marketPda,
  vaultPda,
  positionPda,
} from '@/lib/anchor';
import { SIDE_YES, SIDE_NO, type BetSide } from '@/types/contract';
import idl from '@/idl/gymcast.json';

/** Typed error so callers can show a friendly state instead of throwing on render. */
export class MarketClientError extends Error {
  readonly code: 'NO_PROGRAM' | 'NO_WALLET';
  constructor(code: 'NO_PROGRAM' | 'NO_WALLET', message: string) {
    super(message);
    this.name = 'MarketClientError';
    this.code = code;
  }
}

/**
 * `program.methods` is dynamically generated per-IDL. With the generic
 * `Program<Idl>` type those method names aren't statically known, so we view
 * the namespace through a permissive builder shape. Account/arg validation
 * still happens at runtime against the IDL.
 */
interface MethodBuilder {
  accounts(accounts: Record<string, PublicKey>): MethodBuilder;
  rpc(): Promise<string>;
}
type MethodsMap = Record<string, (...args: unknown[]) => MethodBuilder>;

interface MarketClientArgs {
  connection: Connection;
  /** From `useAnchorWallet()` — undefined when no wallet is connected. */
  wallet: AnchorWallet | undefined;
}

function ensureReady(args: MarketClientArgs) {
  if (!PROGRAM_ID_STR) {
    throw new MarketClientError(
      'NO_PROGRAM',
      'Market not live yet — deploy the Anchor program and set NEXT_PUBLIC_PROGRAM_ID first.',
    );
  }
  if (!args.wallet) {
    throw new MarketClientError('NO_WALLET', 'Connect a wallet to continue.');
  }
  return args.wallet;
}

/** Coerce a base58 string or PublicKey into a PublicKey. */
function toPubkey(value: PublicKey | string): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

/** Unix seconds from a Date or ISO string. */
function toUnix(deadline: Date | string): number {
  const ms = deadline instanceof Date ? deadline.getTime() : Date.parse(deadline);
  return Math.floor(ms / 1000);
}

/**
 * Create a per-challenge market.
 *
 * The Market PDA is `["market", creator, slug]`; `slug` must be <= 32 bytes.
 * The caller supplies a deterministic `slug` (e.g. first 8 hex of a hash of the
 * challenge id) so the returned `marketPda`/`vaultPda` can be persisted via
 * `api.attachMarket`. The slug is echoed back for convenience.
 */
export async function initializeMarket({
  connection,
  wallet,
  slug,
  deadline,
  authority,
}: MarketClientArgs & {
  slug: string;
  deadline: Date | string;
  authority: PublicKey | string;
}): Promise<{ txSig: string; marketPda: string; vaultPda: string; slug: string }> {
  const w = ensureReady({ connection, wallet });

  if (new TextEncoder().encode(slug).length > 32) {
    throw new Error('Slug exceeds the 32-byte PDA seed limit.');
  }

  const programId = getProgramId();
  const creator = w.publicKey;
  const [market] = marketPda(creator, slug, programId);
  const [vault] = vaultPda(market, programId);
  const authorityPk = toPubkey(authority);
  const deadlineUnix = toUnix(deadline);

  const program = getProgram(idl as Idl, connection, w);
  const methods = program.methods as unknown as MethodsMap;

  const txSig = await methods
    .initializeMarket(new BN(deadlineUnix), authorityPk, slug)
    .accounts({
      creator,
      market,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { txSig, marketPda: market.toBase58(), vaultPda: vault.toBase58(), slug };
}

/**
 * Place a YES/NO bet of `amountLamports` against an existing market.
 * Returns the tx signature and the bettor's Position PDA (for mirroring).
 */
export async function placeBet({
  connection,
  wallet,
  marketPda: marketAddr,
  side,
  amountLamports,
}: MarketClientArgs & {
  marketPda: PublicKey | string;
  side: BetSide;
  amountLamports: number;
}): Promise<{ txSig: string; positionPda: string }> {
  const w = ensureReady({ connection, wallet });

  const programId = getProgramId();
  const market = toPubkey(marketAddr);
  const bettor = w.publicKey;
  const [vault] = vaultPda(market, programId);
  const [position] = positionPda(market, bettor, programId);
  const sideByte = side === 'yes' ? SIDE_YES : SIDE_NO;

  const program = getProgram(idl as Idl, connection, w);
  const methods = program.methods as unknown as MethodsMap;

  const txSig = await methods
    .placeBet(sideByte, new BN(amountLamports))
    .accounts({
      bettor,
      market,
      vault,
      position,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { txSig, positionPda: position.toBase58() };
}

/**
 * Claim winnings (or a refund) for the connected wallet's position in a
 * resolved market. Returns the tx signature.
 */
export async function claimWinnings({
  connection,
  wallet,
  marketPda: marketAddr,
}: MarketClientArgs & {
  marketPda: PublicKey | string;
}): Promise<{ txSig: string }> {
  const w = ensureReady({ connection, wallet });

  const programId = getProgramId();
  const market = toPubkey(marketAddr);
  const bettor = w.publicKey;
  const [vault] = vaultPda(market, programId);
  const [position] = positionPda(market, bettor, programId);

  const program = getProgram(idl as Idl, connection, w);
  const methods = program.methods as unknown as MethodsMap;

  const txSig = await methods
    .claimWinnings()
    .accounts({
      bettor,
      market,
      vault,
      position,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { txSig };
}
