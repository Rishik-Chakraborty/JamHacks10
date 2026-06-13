# GymCast — Setup & Demo Script

Everything is built and typechecks/builds clean. To run end-to-end you supply three
credentials/steps that code can't self-provision; the app degrades gracefully without them.

## Prerequisites
- **MongoDB Atlas** cluster (free M0 is fine) → connection string. Atlas is a replica set, so
  Change Streams (live ticker/Hype Meter) work out of the box.
- **OpenAI API key** (for the resolution oracle). Optional to start — manual resolve works without it.
- **Phantom wallet** on **devnet** + a little devnet SOL (https://faucet.solana.com).
- **Solana Playground** deploy (for real on-chain betting) — optional; the social/odds/charts/ticker
  demo runs fully without it.

## 1. Backend
```bash
cd backend
cp .env.example .env
# Fill at minimum MONGODB_URI. Add OPENAI_API_KEY for AI resolve.
# For on-chain: PROGRAM_ID + AUTHORITY_SECRET_KEY (see step 3).
npm run dev          # http://localhost:5000  (GET /api/health shows {solana, ai} flags)
npm run seed         # (separate terminal, once) loads demo users/challenges/photos/bets
```

## 2. Frontend
```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:5000/api (default is fine)
# After step 3: NEXT_PUBLIC_PROGRAM_ID + NEXT_PUBLIC_ORACLE_AUTHORITY
npm run dev          # http://localhost:3000
```

## 3. Solana program (for real betting) — see `solana/README.md`
1. Open https://beta.solpg.io → new Anchor project → paste `solana/programs/gymcast/src/lib.rs`.
2. `build` → `solana airdrop 2` → `deploy`. Copy the **Program Id**.
3. Set `PROGRAM_ID` (backend `.env`) and `NEXT_PUBLIC_PROGRAM_ID` (frontend `.env.local`).
4. Create the **oracle authority** keypair (e.g. `solana-keygen new -o oracle.json`, then
   `solana airdrop 1 <pubkey> --url devnet`). Put its secret in backend `AUTHORITY_SECRET_KEY`
   (base58 or JSON array) and its **public key** in frontend `NEXT_PUBLIC_ORACLE_AUTHORITY`.
5. Export the real IDL from Playground over `solana/idl/gymcast.json` AND `frontend/src/idl/gymcast.json`.

## Demo walkthrough (the money shot)
1. **Feed** (`/`) — seeded challenges with live YES/NO odds bars, pools in SOL, Hype Meters; the
   bottom **live ticker** scrolls bets/photos/commentary.
2. **Create** (`/create`) — connect Phantom, create a challenge. With the program deployed, the
   creator signs `initialize_market` (PDA escrow) and the market id is attached automatically.
3. **Challenge detail** (`/challenge/[id]`) — progress chart (recharts), photo gallery, animated
   Hype Meter, comments, and the **Bet Module**.
4. **Bet** — second Phantom wallet buys YES or NO; lamports escrow into the vault PDA, the bet
   mirrors to MongoDB, odds + Hype update **live** via Change Streams → Socket.io, and the ticker
   pops the wager. Verify the tx on Solana Explorer (devnet).
5. **Post the final photo** — creator marks a photo `isFinal`.
6. **Resolve** — `POST /api/challenges/:id/resolve` → **GPT-5 vision** judges the final photo vs the
   success criteria (structured `{met, confidence, reasoning, observedEvidence}`); high-confidence
   verdicts auto-resolve `resolve_market` on-chain (low-confidence routes to manual override).
7. **Claim** — winning wallet clicks Claim → `claim_winnings` pays out the proportional parimutuel
   share from the vault. Verify payout on Explorer.

## Degraded modes (graceful)
- **No PROGRAM_ID** → betting UI shows "market not live yet"; everything else works.
- **No OPENAI_API_KEY** → resolve requires a `manualOutcome` (admin override) and says so.
- **No replica set** (local standalone mongod) → server still boots; live ticker/Hype just won't push.

## Health check
`GET http://localhost:5000/api/health` → `{ status, service, solana: bool, ai: bool }`.
