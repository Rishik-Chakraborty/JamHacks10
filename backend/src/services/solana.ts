/**
 * Solana oracle service.
 *
 * Server-side authority that resolves on-chain parimutuel markets. Builds an
 * Anchor program client from the hand-authored IDL (`solana/idl/gymcast.json`)
 * and the authority Keypair loaded from `AUTHORITY_SECRET_KEY`.
 *
 * Only `resolve_market` requires the authority signature; the bet flow
 * (`place_bet` / `claim_winnings`) is signed client-side via wallet-adapter.
 * Read-only helpers let routes mirror on-chain pool state into MongoDB.
 *
 * Guarded by `env.solanaEnabled` — every entrypoint throws a clear error when
 * Solana is not configured so the rest of the app can degrade gracefully.
 */
import {
  AnchorProvider,
  Program,
  Wallet,
  BN,
  utils as anchorUtils,
  type Idl,
} from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';

import { env } from '../config/env';
import { OUTCOME_YES, OUTCOME_NO, type BetSide, type Challenge } from '../contract';
import idlJson from '../../../solana/idl/gymcast.json';

/** Anchor IDL for the gymcast program (typed loosely as `Idl`). */
const IDL = idlJson as Idl;

/** PDA seed prefixes (must match the on-chain program + shared/types). */
const MARKET_SEED = Buffer.from('market');
const VAULT_SEED = Buffer.from('vault');
const POSITION_SEED = Buffer.from('position');

/** On-chain Market account shape (subset we read). */
export interface MarketState {
  creator: string;
  authority: string;
  deadline: number;
  yesPoolLamports: number;
  noPoolLamports: number;
  resolved: boolean;
  /** 0 = unset, 1 = yes, 2 = no. */
  outcome: number;
  slug: string;
}

/** Raw decoded Anchor account (snake_case fields, BN numerics). */
interface RawMarket {
  creator: PublicKey;
  authority: PublicKey;
  deadline: BN;
  yesPool: BN;
  noPool: BN;
  resolved: boolean;
  outcome: number;
  slug: string;
  bump: number;
  vaultBump: number;
}

function assertEnabled(): void {
  if (!env.solanaEnabled) {
    throw new Error(
      'solana not configured: set PROGRAM_ID and AUTHORITY_SECRET_KEY to enable on-chain oracle calls',
    );
  }
}

/**
 * Parse the authority secret key. Supports either a base58-encoded string
 * (Phantom export) or a JSON byte array (solana-keygen `id.json`).
 */
function loadAuthorityKeypair(): Keypair {
  const raw = env.AUTHORITY_SECRET_KEY.trim();
  if (!raw) {
    throw new Error('solana not configured: AUTHORITY_SECRET_KEY is empty');
  }

  // JSON array form: e.g. "[12,34,...]".
  if (raw.startsWith('[')) {
    let bytes: number[];
    try {
      bytes = JSON.parse(raw) as number[];
    } catch {
      throw new Error('AUTHORITY_SECRET_KEY is not valid JSON byte array');
    }
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }

  // base58 form.
  return Keypair.fromSecretKey(Uint8Array.from(anchorUtils.bytes.bs58.decode(raw)));
}

/* -------------------------------------------------------------------------- */
/* Lazily-built singletons                                                    */
/* -------------------------------------------------------------------------- */

let cached: {
  connection: Connection;
  authority: Keypair;
  program: Program;
  programId: PublicKey;
} | null = null;

function getClient() {
  assertEnabled();
  if (cached) return cached;

  const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');
  const authority = loadAuthorityKeypair();
  const programId = new PublicKey(env.PROGRAM_ID);

  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });

  // Anchor 0.30 reads the program address from the IDL `address` field; we
  // override it with the deployed PROGRAM_ID so the configured id wins.
  const idl: Idl = { ...IDL, address: programId.toBase58() };
  const program = new Program(idl, provider);

  cached = { connection, authority, program, programId };
  return cached;
}

/* -------------------------------------------------------------------------- */
/* PDA derivation                                                             */
/* -------------------------------------------------------------------------- */

export function deriveMarketPda(
  creator: PublicKey,
  slug: string,
  programId: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, creator.toBuffer(), Buffer.from(slug)],
    programId,
  );
  return pda;
}

export function deriveVaultPda(market: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, market.toBuffer()],
    programId,
  );
  return pda;
}

export function derivePositionPda(
  market: PublicKey,
  bettor: PublicKey,
  programId: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [POSITION_SEED, market.toBuffer(), bettor.toBuffer()],
    programId,
  );
  return pda;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Fetch + decode a Market account by its PDA. Returns null if not found. */
export async function fetchMarket(marketPda: string): Promise<MarketState | null> {
  const { program } = getClient();
  const pubkey = new PublicKey(marketPda);

  // `program.account.market` keys off the IDL account name (lowercased).
  const accountClient = (program.account as Record<string, {
    fetchNullable(addr: PublicKey): Promise<RawMarket | null>;
  }>).market;

  const raw = await accountClient.fetchNullable(pubkey);
  if (!raw) return null;

  return {
    creator: raw.creator.toBase58(),
    authority: raw.authority.toBase58(),
    deadline: raw.deadline.toNumber(),
    yesPoolLamports: raw.yesPool.toNumber(),
    noPoolLamports: raw.noPool.toNumber(),
    resolved: raw.resolved,
    outcome: raw.outcome,
    slug: raw.slug,
  };
}

/* -------------------------------------------------------------------------- */
/* Oracle write: resolve_market                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a challenge's on-chain market with the authority signature.
 *
 * @param challenge the challenge whose `marketPda` will be resolved
 * @param outcome   'yes' or 'no' — encoded to OUTCOME_YES / OUTCOME_NO on-chain
 * @returns the confirmed transaction signature
 */
export async function resolveMarket(
  challenge: Challenge,
  outcome: BetSide,
): Promise<string> {
  assertEnabled();

  if (!challenge.marketPda) {
    throw new Error(
      `challenge ${challenge.id} has no marketPda — initialize_market must run first`,
    );
  }

  const { program, authority, programId } = getClient();
  const marketPda = new PublicKey(challenge.marketPda);
  const vault = deriveVaultPda(marketPda, programId);
  const influencer = new PublicKey(challenge.creatorWallet); // subject — receives the creator cut
  const platform = authority.publicKey; // platform fee recipient (the oracle authority)
  const outcomeCode = outcome === 'yes' ? OUTCOME_YES : OUTCOME_NO;

  const txSig = await program.methods
    .resolveMarket(outcomeCode)
    .accounts({
      authority: authority.publicKey,
      market: marketPda,
      vault,
      influencer,
      platform,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return txSig;
}

/**
 * Refund a market (influencer no-show / declined) with the authority signature.
 * Afterwards each bettor reclaims their stake via `claim_winnings`.
 */
export async function refundMarket(challenge: Challenge): Promise<string> {
  assertEnabled();
  if (!challenge.marketPda) {
    throw new Error(`challenge ${challenge.id} has no marketPda — nothing to refund on-chain`);
  }

  const { program, authority } = getClient();
  const marketPda = new PublicKey(challenge.marketPda);

  const txSig = await program.methods
    .refundMarket()
    .accounts({
      authority: authority.publicKey,
      market: marketPda,
    })
    .signers([authority])
    .rpc();

  return txSig;
}

/* -------------------------------------------------------------------------- */
/* Re-exports for callers that build PDAs / accounts                          */
/* -------------------------------------------------------------------------- */

export { SystemProgram };
