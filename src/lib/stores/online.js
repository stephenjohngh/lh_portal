// src/lib/stores/online.js
// Reactive connectivity — `$online` is true/false from navigator.onLine, kept in
// sync with the window 'online'/'offline' events. Shared: the Inspection app's
// offline signal and its sync runner both read it. SSR-safe (defaults to true).

import { readable } from 'svelte/store';

const initial = typeof navigator !== 'undefined' ? navigator.onLine : true;

export const online = readable(initial, (set) => {
  if (typeof window === 'undefined') return;
  const on  = () => set(true);
  const off = () => set(false);
  window.addEventListener('online',  on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online',  on);
    window.removeEventListener('offline', off);
  };
});
