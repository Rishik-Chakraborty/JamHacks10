"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIo = setIo;
exports.getIo = getIo;
exports.emitTicker = emitTicker;
exports.emitHype = emitHype;
exports.initRealtime = initRealtime;
const contract_1 = require("../contract");
const db_1 = require("../config/db");
const odds_1 = require("../services/odds");
const hype_1 = require("../services/hype");
let io = null;
function setIo(server) {
    io = server;
}
function getIo() {
    return io;
}
/** Broadcast a global ticker event. */
function emitTicker(event) {
    io?.emit(contract_1.SOCKET_EVENTS.TICKER, event);
}
/** Push a Hype Meter + odds update to a challenge room. */
function emitHype(update) {
    io?.to(`challenge:${update.challengeId}`).emit(contract_1.SOCKET_EVENTS.HYPE, update);
}
/** Load a challenge doc by its string id and emit a fresh hype + odds update. */
async function recomputeAndEmitHype(challengeId) {
    if (!challengeId)
        return;
    const challenges = db_1.mongoose.connection.collection('challenges');
    // Stored _id may be an ObjectId or a string depending on the API agent's schema.
    let raw = null;
    if (db_1.mongoose.isValidObjectId(challengeId)) {
        raw = await challenges.findOne({ _id: new db_1.mongoose.Types.ObjectId(challengeId) });
    }
    if (!raw) {
        raw = await challenges.findOne({ _id: challengeId });
    }
    if (!raw)
        return;
    const doc = raw;
    const odds = (0, odds_1.computeOdds)(doc.yesPoolLamports ?? 0, doc.noPoolLamports ?? 0);
    const update = (0, hype_1.buildHypeUpdate)({
        id: challengeId,
        streak: doc.streak ?? 0,
        misses: doc.misses ?? 0,
    }, odds);
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
async function initRealtime(_io) {
    try {
        const bets = db_1.mongoose.connection.collection('bets');
        const photos = db_1.mongoose.connection.collection('photos');
        const betStream = bets.watch([{ $match: { operationType: 'insert' } }], {
            fullDocument: 'updateLookup',
        });
        betStream.on('change', (change) => {
            void (async () => {
                try {
                    if (change.operationType !== 'insert')
                        return;
                    const bet = change.fullDocument;
                    if (!bet)
                        return;
                    emitTicker({
                        kind: 'bet',
                        // fullDocument fields are raw BSON — challengeId is an ObjectId; stringify
                        // it so the socket payload carries the hex id the client links on.
                        challengeId: bet.challengeId ? String(bet.challengeId) : '',
                        wallet: bet.bettorWallet,
                        side: bet.side,
                        amountLamports: bet.amountLamports,
                        at: new Date().toISOString(),
                    });
                    await recomputeAndEmitHype(bet.challengeId);
                }
                catch (err) {
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
                    if (change.operationType !== 'insert')
                        return;
                    const photo = change.fullDocument;
                    if (!photo)
                        return;
                    emitTicker({
                        kind: 'photo',
                        challengeId: photo.challengeId ? String(photo.challengeId) : '',
                        message: photo.isFinal ? 'Final photo posted' : 'New progress photo',
                        at: new Date().toISOString(),
                    });
                    await recomputeAndEmitHype(photo.challengeId);
                }
                catch (err) {
                    console.error('[realtime] photo change handler error:', err);
                }
            })();
        });
        photoStream.on('error', (err) => console.error('[realtime] photos change stream error:', err));
        console.log('✅ Realtime change streams watching bets + photos');
    }
    catch (err) {
        console.warn('⚠️  Realtime change streams unavailable (Change Streams require a MongoDB replica set / Atlas). ' +
            'Continuing without live ticker/hype updates.', err);
    }
}
