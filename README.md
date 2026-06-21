# GymCast 🏋️📈 (The GainsXChange)

**BeReal × Polymarket for fitness.** GymCast (also known as The GainsXChange) is a prediction market for success—or lack thereof—in the gym, built into a social media app. It utilizes influencer creator programs and betting lines, powered by Solana's secure blockchain financial functions.

### 🏆 Featured on Devpost
Check out our submission: [The GainsXChange on Devpost](https://devpost.com/software/the-gainsxchange?_gl=1*17bp9ts*_gcl_au*NTY2NzE3ODkwLjE3NzYzMDg1MTI.*_ga*MTAzMDk1OTg0LjE3NzYzMDg1MTM.*_ga_0YHJK3Y10M*czE3ODIwNzIzODckbzEyJGcxJHQxNzgyMDcyNDI3JGoyMCRsMCRoMA..)

### 🎥 Watch the Demo
See it in action: [GymCast Demo Video](https://www.youtube.com/watch?v=s2iHdTwtGBk&time_continue=1&source_ve_path=MjE0Mjgz&embeds_referring_euri=https%3A%2F%2Fdevpost.com%2F)

---

## The Idea & Motivation
Fitness journeys are notoriously hard to stick to. People set goals, lose motivation, and quit. Social accountability helps, but financial stakes take it to the next level. **GymCast** was born from the idea that having real skin in the game (via crypto betting) combined with daily public accountability (like BeReal) creates the ultimate incentive structure for hitting the gym.

Creators broadcast a specific, measurable fitness goal (e.g., "visible bicep vein by Nov 1"). Spectators and fans can then connect a Solana wallet and bet **YES or NO** on whether the creator will achieve their goal. All funds are placed into escrowed parimutuel pools on the Solana blockchain.

To keep everyone engaged, the platform features:
- **Daily Progress Photos**: Creators post updates to prove they are working towards the goal.
- **Live Hype Meter**: Spectators can react and build momentum.
- **Live Ticker**: Scrolling feed of bets, photos, and commentary.

At the deadline, an **OpenAI vision model** automatically judges the final photo against the original criteria. The backend oracle then resolves the on-chain market, allowing the winners to claim a proportional share of the pot. It's a fun, engaging, and financially incentivized way to reach fitness goals.

> Built for JamHacks10. Targets: Best Use of **Solana**, **GenAI**, and **MongoDB**.

## Architecture
- **frontend/** — Next.js 16 / React 19 / Tailwind v4 dashboard (feed, charts, betting, ticker).
- **backend/** — Express + Socket.io API, MongoDB Atlas (Change Streams, time-series, GridFS), OpenAI oracle, Solana settlement.
- **solana/** — Anchor parimutuel market program (devnet).
- **shared/types.ts** — single source of truth for the cross-package contract.



## Quickstart
### Backend
```bash
cd backend && npm install
cp .env.example .env            # fill MONGODB_URI, OPENAI_API_KEY, PROGRAM_ID, AUTHORITY_SECRET_KEY
npm run dev                     # http://localhost:5000
npm run seed                    # Optional: load demo data
```

### Frontend
```bash
# In a new terminal
cd frontend && npm install
cp .env.local.example .env.local
npm run dev                     # http://localhost:3000
```

### Solana Program
For Solana program build and deploy instructions, please see [solana/README.md](./solana/README.md).
