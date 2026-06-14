'use client';

import { useEffect } from 'react';

/** Registers the service worker so the app is installable to the home screen. */
export function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration is best-effort */
      });
    }
  }, []);
  return null;
}
