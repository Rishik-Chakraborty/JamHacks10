/**
 * Socket.io client singleton + typed helpers for ticker / hype streams.
 */
'use client';

import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type TickerEvent,
  type HypeUpdate,
} from '@/types/contract';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

export function onTicker(cb: (e: TickerEvent) => void): () => void {
  const s = getSocket();
  s.on(SOCKET_EVENTS.TICKER, cb);
  return () => s.off(SOCKET_EVENTS.TICKER, cb);
}

export function onHype(challengeId: string, cb: (u: HypeUpdate) => void): () => void {
  const s = getSocket();
  s.emit(SOCKET_EVENTS.JOIN, challengeId);
  const handler = (u: HypeUpdate) => {
    if (u.challengeId === challengeId) cb(u);
  };
  s.on(SOCKET_EVENTS.HYPE, handler);
  return () => {
    s.emit(SOCKET_EVENTS.LEAVE, challengeId);
    s.off(SOCKET_EVENTS.HYPE, handler);
  };
}
