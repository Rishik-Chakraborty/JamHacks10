# GymCast 🏋️📈

**BeReal × Polymarket for fitness.** Creators broadcast a fitness goal (e.g. "visible bicep
vein by Nov 1"); spectators connect a Solana wallet and bet **YES/NO** into escrowed parimutuel
pools. Daily progress photos + a live **Hype Meter** drive engagement; at the deadline an OpenAI
vision model judges the final photo and the backend (oracle) resolves the on-chain market so
winners claim a proportional share of the pot.

> Built for JamHacks10. Targets: Best Use of **Solana**, **GenAI**, and **MongoDB**.

## Architecture
- **frontend/** — Next.js 16 / React 19 / Tailwind v4 dashboard (feed, charts, betting, ticker).
- **backend/** — Express + Socket.io API, MongoDB Atlas (Change Streams, time-series, GridFS),
  OpenAI oracle, Solana settlement.
- **solana/** — Anchor parimutuel market program (devnet).
- **shared/types.ts** — single source of truth for the cross-package contract.

See [CLAUDE.md](./CLAUDE.md) for conventions and the build plan for the multi-agent milestone map.

## Quickstart
```bash
# backend
cd backend && npm install
cp .env.example .env            # fill MONGODB_URI, OPENAI_API_KEY, PROGRAM_ID, AUTHORITY_SECRET_KEY
npm run dev                     # http://localhost:5000

# frontend (new terminal)
cd frontend && npm install
cp .env.local.example .env.local
npm run dev                     # http://localhost:3000
```
Solana program build/deploy: see [solana/README.md](./solana/README.md).
