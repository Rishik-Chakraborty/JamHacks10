"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemProgram = void 0;
exports.deriveMarketPda = deriveMarketPda;
exports.deriveVaultPda = deriveVaultPda;
exports.derivePositionPda = derivePositionPda;
exports.fetchMarket = fetchMarket;
exports.resolveMarket = resolveMarket;
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
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
Object.defineProperty(exports, "SystemProgram", { enumerable: true, get: function () { return web3_js_1.SystemProgram; } });
const env_1 = require("../config/env");
const contract_1 = require("../contract");
const gymcast_json_1 = __importDefault(require("../../../solana/idl/gymcast.json"));
/** Anchor IDL for the gymcast program (typed loosely as `Idl`). */
const IDL = gymcast_json_1.default;
/** PDA seed prefixes (must match the on-chain program + shared/types). */
const MARKET_SEED = Buffer.from('market');
const VAULT_SEED = Buffer.from('vault');
const POSITION_SEED = Buffer.from('position');
function assertEnabled() {
    if (!env_1.env.solanaEnabled) {
        throw new Error('solana not configured: set PROGRAM_ID and AUTHORITY_SECRET_KEY to enable on-chain oracle calls');
    }
}
/**
 * Parse the authority secret key. Supports either a base58-encoded string
 * (Phantom export) or a JSON byte array (solana-keygen `id.json`).
 */
function loadAuthorityKeypair() {
    const raw = env_1.env.AUTHORITY_SECRET_KEY.trim();
    if (!raw) {
        throw new Error('solana not configured: AUTHORITY_SECRET_KEY is empty');
    }
    // JSON array form: e.g. "[12,34,...]".
    if (raw.startsWith('[')) {
        let bytes;
        try {
            bytes = JSON.parse(raw);
        }
        catch {
            throw new Error('AUTHORITY_SECRET_KEY is not valid JSON byte array');
        }
        return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(bytes));
    }
    // base58 form.
    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(anchor_1.utils.bytes.bs58.decode(raw)));
}
/* -------------------------------------------------------------------------- */
/* Lazily-built singletons                                                    */
/* -------------------------------------------------------------------------- */
let cached = null;
function getClient() {
    assertEnabled();
    if (cached)
        return cached;
    const connection = new web3_js_1.Connection(env_1.env.SOLANA_RPC_URL, 'confirmed');
    const authority = loadAuthorityKeypair();
    const programId = new web3_js_1.PublicKey(env_1.env.PROGRAM_ID);
    const wallet = new anchor_1.Wallet(authority);
    const provider = new anchor_1.AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
    });
    // Anchor 0.30 reads the program address from the IDL `address` field; we
    // override it with the deployed PROGRAM_ID so the configured id wins.
    const idl = { ...IDL, address: programId.toBase58() };
    const program = new anchor_1.Program(idl, provider);
    cached = { connection, authority, program, programId };
    return cached;
}
/* -------------------------------------------------------------------------- */
/* PDA derivation                                                             */
/* -------------------------------------------------------------------------- */
function deriveMarketPda(creator, slug, programId) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([MARKET_SEED, creator.toBuffer(), Buffer.from(slug)], programId);
    return pda;
}
function deriveVaultPda(market, programId) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([VAULT_SEED, market.toBuffer()], programId);
    return pda;
}
function derivePositionPda(market, bettor, programId) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([POSITION_SEED, market.toBuffer(), bettor.toBuffer()], programId);
    return pda;
}
/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */
/** Fetch + decode a Market account by its PDA. Returns null if not found. */
async function fetchMarket(marketPda) {
    const { program } = getClient();
    const pubkey = new web3_js_1.PublicKey(marketPda);
    // `program.account.market` keys off the IDL account name (lowercased).
    const accountClient = program.account.market;
    const raw = await accountClient.fetchNullable(pubkey);
    if (!raw)
        return null;
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
async function resolveMarket(challenge, outcome) {
    assertEnabled();
    if (!challenge.marketPda) {
        throw new Error(`challenge ${challenge.id} has no marketPda — initialize_market must run first`);
    }
    const { program, authority } = getClient();
    const marketPda = new web3_js_1.PublicKey(challenge.marketPda);
    const outcomeCode = outcome === 'yes' ? contract_1.OUTCOME_YES : contract_1.OUTCOME_NO;
    const txSig = await program.methods
        .resolveMarket(outcomeCode)
        .accounts({
        authority: authority.publicKey,
        market: marketPda,
    })
        .signers([authority])
        .rpc();
    return txSig;
}
