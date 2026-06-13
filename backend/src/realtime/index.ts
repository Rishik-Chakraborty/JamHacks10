/**
 * Realtime singleton + init hook. The Realtime agent implements:
 *  - Change Stream watchers on `bets` and `photos`
 *  - emitting SOCKET_EVENTS.TICKER (global) and SOCKET_EVENTS.HYPE (per-challenge room)
 *
 * Other modules emit via the helpers below (set up by Foundation so routes can
 * push events without importing socket.io directly).
 */
import type { Server as SocketServer } from 'socket.io';
import type { TickerEvent, HypeUpdate } from '../contract';
import { SOCKET_EVENTS } from '../contract';
import { mongoose } from '../config/db';
import { computeOdds } from '../services/odds';
import { buildHypeUpdate } from '../services/hype';

let io: SocketServer | null = null;

export function setIo(server: SocketServer): void {
  io = server;
}

export function getIo(): SocketServer | null {
  return io;
}

/** Broadcast a global ticker event. */
export function emitTicker(event: TickerEvent): void {
  io?.emit(SOCKET_EVENTS.TICKER, event);
}

/** Push a Hype Meter + odds update to a challenge room. */
export function emitHype(update: HypeUpdate): void {
  io?.to(`challenge:${update.challengeId}`).emit(SOCKET_EVENTS.HYPE, update);
}

/* ----------------------------------------------------------------------------
 * Change Stream watchers
 *
 * We read raw collections via `mongoose.connection.collection(...)` rather than
 * importing the API agent's mongoose models — this keeps the realtime slice
 * independent so the two can be built in parallel.
 * ------------------------------------------------------------------------- */

/** Minimal shape of a challenge doc as stored in Mongo (only fields we read). */
interface ChallengeDoc {
  _id: unknown;
  title?: string;
  yesPoolLamports?: number;
  noPoolLamports?: number;
  streak?: number;
  misses?: number;
}

/** Minimal shape of a bet doc. */
interface BetDoc {
  challengeId?: string;
  bettorWallet?: string;
  side?: 'yes' | 'no';
  amountLamports?: number;
}

/** Minimal shape of a photo doc. */
interface PhotoDoc {
  challengeId?: string;
  isFinal?: boolean;
}

/** Load a challenge doc by its string id and emit a fresh hype + odds update. */
async function recomputeAndEmitHype(challengeId: string | undefined): Promise<void> {
  if (!challengeId) return;
  const challenges = mongoose.connection.collection('challenges');

  // Stored _id may be an ObjectId or a string depending on the API agent's schema.
  let raw: unknown = null;
  if (mongoose.isValidObjectId(challengeId)) {
    raw = await challenges.findOne({ _id: new mongoose.Types.ObjectId(challengeId) });
  }
  if (!raw) {
    raw = await challenges.findOne({ _id: challengeId as unknown as object });
  }
  if (!raw) return;
  const doc = raw as ChallengeDoc;

  const odds = computeOdds(doc.yesPoolLamports ?? 0, doc.noPoolLamports ?? 0);
  const update: HypeUpdate = buildHypeUpdate(
    {
      id: challengeId,
      streak: doc.streak ?? 0,
      misses: doc.misses ?? 0,
    },
    odds,
  );
  emitHype(update);
}

/**
 * Initialize MongoDB Change Stream watchers on `bets` and `photos`.
 *
 * On a bet insert: emit a global ticker event, then recompute that challenge's
 * odds + hype and push to its room. On a photo insert: emit a ticker event and
 * recompute hype.
 *
 * Change Streams require a replica set (Atlas). If unsupported we log a clear
 * warning and continue — the server must still boot.
 */
export async function initRealtime(_io: SocketServer): Promise<void> {
  try {
    const bets = mongoose.connection.collection('bets');
    const photos = mongoose.connection.collection('photos');

    const betStream = bets.watch([{ $match: { operationType: 'insert' } }], {
      fullDocument: 'updateLookup',
    });
    betStream.on('change', (change) => {
      void (async () => {
        try {
          if (change.operationType !== 'insert') return;
          const bet = change.fullDocument as BetDoc | undefined;
          if (!bet) return;
          emitTicker({
            kind: 'bet',
            challengeId: bet.challengeId ?? '',
            wallet: bet.bettorWallet,
            side: bet.side,
            amountLamports: bet.amountLamports,
            at: new Date().toISOString(),
          });
          await recomputeAndEmitHype(bet.challengeId);
        } catch (err) {
          console.error('[realtime] bet change handler error:', err);
        }
      })();
    });
    betStream.on('error', (err) => console.error('[realtime] bets change stream error:', err));

    const photoStream = photos.watch([{ $match: { operationType: 'insert' } }], {
      fullDocument: 'updateLookup',
    });
    photoStream.on('change', (change) => {
      void (async () => {
        try {
          if (change.operationType !== 'insert') return;
          const photo = change.fullDocument as PhotoDoc | undefined;
          if (!photo) return;
          emitTicker({
            kind: 'photo',
            challengeId: photo.challengeId ?? '',
            message: photo.isFinal ? 'Final photo posted' : 'New progress photo',
            at: new Date().toISOString(),
          });
          await recomputeAndEmitHype(photo.challengeId);
        } catch (err) {
          console.error('[realtime] photo change handler error:', err);
        }
      })();
    });
    photoStream.on('error', (err) => console.error('[realtime] photos change stream error:', err));

    console.log('✅ Realtime change streams watching bets + photos');
  } catch (err) {
    console.warn(
      '⚠️  Realtime change streams unavailable (Change Streams require a MongoDB replica set / Atlas). ' +
        'Continuing without live ticker/hype updates.',
      err,
    );
  }
}
