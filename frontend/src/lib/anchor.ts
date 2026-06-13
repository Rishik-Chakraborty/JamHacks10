/**
 * Anchor program client helpers.
 *
 * The Solana agent exports the deployed IDL to `solana/idl/gymcast.json` and
 * sets NEXT_PUBLIC_PROGRAM_ID. Until then `getProgram` throws a clear error.
 *
 * PDA derivation MUST match the on-chain seeds:
 *   market   = ["market", creator, slugBytes]
 *   vault    = ["vault", market]
 *   position = ["position", market, bettor]
 */
import { PublicKey, type Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';

export const PROGRAM_ID_STR = process.env.NEXT_PUBLIC_PROGRAM_ID ?? '';

export function getProgramId(): PublicKey {
  if (!PROGRAM_ID_STR) throw new Error('NEXT_PUBLIC_PROGRAM_ID is not set — deploy the Anchor program first');
  return new PublicKey(PROGRAM_ID_STR);
}

/**
 * Build a Program client. Pass the loaded IDL (import from solana/idl/gymcast.json
 * once it exists). Kept generic so the Bet Module agent can wire it post-deploy.
 */
export function getProgram(idl: Idl, connection: Connection, wallet: AnchorWallet): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  return new Program(idl, provider);
}

const enc = new TextEncoder();

export function marketPda(creator: PublicKey, slug: string, programId = getProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode('market'), creator.toBuffer(), enc.encode(slug)],
    programId,
  );
}

export function vaultPda(market: PublicKey, programId = getProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([enc.encode('vault'), market.toBuffer()], programId);
}

export function positionPda(market: PublicKey, bettor: PublicKey, programId = getProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode('position'), market.toBuffer(), bettor.toBuffer()],
    programId,
  );
}
