# GymCast Solana program (parimutuel prediction market)

Anchor program managing per-challenge YES/NO escrow pools and trustless proportional payouts.

## Accounts
- **Market** PDA `["market", creator, slug]` — creator, authority (oracle), deadline, yes_pool,
  no_pool, resolved, outcome (0=unset,1=yes,2=no), bump.
- **Vault** PDA `["vault", market]` — SystemAccount holding escrowed lamports.
- **Position** PDA `["position", market, bettor]` — bettor, yes_amount, no_amount, claimed, bump.

## Instructions
- `initialize_market(deadline: i64, authority: Pubkey, slug: String)` — creates the Market +
  Vault PDAs. `slug` (≤ 32 bytes) is part of the Market PDA seed; `authority` is the oracle
  pubkey allowed to resolve. Require `deadline > now`.
- `place_bet(side: u8, amount: u64)` — `side` 0=YES / 1=NO (SIDE_*); require
  `!resolved && now < deadline && amount > 0`; transfers lamports bettor→vault via the system
  program; checked-adds to the market pool and the bettor's Position (init-if-needed).
- `resolve_market(outcome: u8)` — `outcome` 1=YES / 2=NO (OUTCOME_*); `has_one = authority`;
  require `!resolved && now >= deadline`.
- `claim_winnings()` — require `resolved`; payout = `stake_win + stake_win * losing_pool /
  winning_pool` (checked u128 intermediate); one-sided (empty winning or losing pool) → refund
  own stake; losing-only position → 0; sets `position.claimed`; vault→bettor via `invoke_signed`
  with the vault PDA seeds.

Side / outcome encodings are the `SIDE_*` / `OUTCOME_*` constants in `shared/types.ts`.

## Build & deploy — primary path: Solana Playground (no local toolchain)
1. Open https://beta.solpg.io and create a new Anchor project.
2. Paste `programs/gymcast/src/lib.rs` into `src/lib.rs`.
3. In the Playground terminal: `build`, then create a devnet wallet (`solana airdrop 2`), then
   `deploy`.
4. Copy the **Program Id** → set `PROGRAM_ID` (backend `.env`) and `NEXT_PUBLIC_PROGRAM_ID`
   (frontend `.env.local`).
5. Export the **IDL** (Playground: program → Export, or `anchor idl`) and overwrite
   `solana/idl/gymcast.json`. A **hand-authored IDL is already committed** there (Anchor 0.30
   format, discriminators precomputed) so frontend/backend compile *before* deploy; after the
   real build, replace it with the exported one and re-set `address` to the deployed program id.

The committed program id placeholder is `Gym1111111111111111111111111111111111111111`
(in `declare_id!`, `Anchor.toml`, and the IDL `address`). Replace it everywhere with the real
deployed id, or just set `PROGRAM_ID` in the backend `.env` — `solana.ts` overrides the IDL
`address` with `PROGRAM_ID` at runtime, so the backend works without re-editing the IDL.

## Optional local path: WSL2
```
# inside WSL2 Ubuntu
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
anchor build && anchor deploy --provider.cluster devnet
anchor idl build > ../idl/gymcast.json   # or `anchor idl fetch`
```

## Oracle/authority keypair (backend)
Generate a devnet keypair, fund it, and put its secret in `AUTHORITY_SECRET_KEY` (backend `.env`).
This key signs `resolve_market`. **Never commit it.** Pass the same pubkey as `authority` when
the creator calls `initialize_market`.
