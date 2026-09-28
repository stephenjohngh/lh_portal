// src/app.d.ts
// Globals the type checker cannot see for itself.
//
// __BUILD_DATE__ is substituted by vite.config.js (`define`) at build time. It
// is declared so that "Cannot find name" in `npm run check:js` always means a
// real missing import — on 2026-09-28 that error found three live crashes.

declare global {
  const __BUILD_DATE__: string;
}

export {};
