# GymCast — Project Guide

BeReal × Polymarket for fitness. Creators set a fitness goal; spectators bet YES/NO with
Solana; daily photo posting + a live Hype Meter drive engagement; an OpenAI vision model
judges the **final** photo and the backend (oracle) resolves the on-chain **parimutuel**
market so winners claim a proportional share of the pot.

## Target prizes
Best Use of Solana · Best Use of GenAI (AI-as-oracle, not a wrapper) · Best Use of MongoDB
(Change Streams + time-series + GridFS). Optional: Best Use of Vultr (backend hosting +
optional GPU ensemble model).

## Stack
- **Frontend**: Next.js 16 (App Router), React 19, TS, Tailwind v4, recharts, @xyflow/react,
  lucide-react, Solana wallet-adapter, @coral-xyz/anchor, TanStack Query, socket.io-client.
- **Backend**: Express + TS (run with **tsx**), MongoDB Atlas (mongoose + GridFS), socket.io +
  Change Streams, `openai` SDK (GPT-5 vision oracle at resolution only; optional GPT-4o
  commentary), @coral-xyz/anchor oracle, node-cron, zod, helmet.
- **Chain**: Anchor (Rust) parimutuel market on Solana **devnet** (built via Solana Playground).

## Layout
- `shared/types.ts` — cross-package types + REST/socket contract (**canonical source**).
  Backend imports it via the barrel `backend/src/contract.ts` (`import { X } from '../contract'`).
  Frontend uses a **local copy** at `frontend/src/types/contract.ts` (imported as `@/types/contract`)
  because Turbopack can't bundle a re-export from outside the Next root — keep the two in sync on any
  wire-shape change (the IDL follows the same copy pattern: `solana/idl` → `frontend/src/idl`).
- `frontend/` — routes in `src/app`, UI in `src/components`, clients in `src/lib`
  (`api`, `socket`, `query`, `wallet`, `anchor`).
- `backend/` — `src/{config,models,routes,services,realtime,middleware}`. Bootstrap in
  `src/index.ts`. Emit realtime via `emitTicker` / `emitHype` from `src/realtime`.
- `solana/` — Anchor program (`programs/gymcast`) + exported IDL (`idl/gymcast.json`).

## Commands
- Frontend: `cd frontend && npm run dev` (http://localhost:3000).
- Backend: `cd backend && npm run dev` (tsx watch, http://localhost:5000). Seed: `npm run seed`.
- Solana: build/deploy in beta.solpg.io; see `solana/README.md`. WSL2 optional for local iteration.

## Conventions
- TS strict; validate all API inputs with zod at the boundary (`middleware/validate.ts`);
  types come from the shared contract.
- Server state via TanStack Query; realtime via socket.io rooms (one per challenge id).
- All AI + Solana-authority calls are **server-side only**; secrets never reach the client.
- On-chain writes mirror to MongoDB **idempotently keyed by tx signature** (`bets.txSig` unique).
- Odds are **parimutuel**: live implied prob = pool share; payout = stake + proportional share
  of the losing pool (authoritative on-chain, checked integer math; refund on one-sided/no-winner).
- Daily photos are **posted manually** — no AI per photo. AI runs **only** on the final photo at
  resolution; verdicts < 0.6 confidence (`MIN_CONFIDENCE`) require manual override before resolve.
- Anchor: checked math, explicit `require!` guards, PDA signer seeds, devnet only.
- Feature flags in `config/env.ts`: `solanaEnabled` / `aiEnabled` let the app degrade gracefully.

## ⚠️ Next.js 16
This repo uses Next.js **16**, which has breaking changes vs. older versions. Before writing any
Next/React Server Component code, read the relevant guide in `frontend/node_modules/next/dist/docs/`.

## Multi-agent build
Foundation agent writes the shared contract + all deps + boot wiring first (done). Core/feature
agents then run in parallel on **disjoint file ownership** (worktree isolation where they'd
overlap). An Integration agent wires everything and runs the demo last. See
`~/.claude/plans/i-am-at-a-mellow-candy.md` for the role/ownership map.

## Env
- Backend `.env` (see `backend/.env.example`): `MONGODB_URI`, `OPENAI_API_KEY`,
  `OPENAI_VISION_MODEL`, `SOLANA_RPC_URL`, `PROGRAM_ID`, `AUTHORITY_SECRET_KEY`, `PORT`,
  `CORS_ORIGIN`. Optional Vultr ensemble: `VULTR_VISION_URL`.
- Frontend `.env.local` (see `frontend/.env.local.example`): `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_PROGRAM_ID`.

## Gotchas
- Windows: do NOT install the Solana toolchain natively — use Solana Playground (or WSL2).
- Never commit keypairs / `.env`. Devnet only.
- Change Streams need a replica set — Atlas provides this; a local standalone `mongod` won't work.
