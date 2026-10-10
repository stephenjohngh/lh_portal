// src/service-worker.js
// SvelteKit service worker — auto-registered by SvelteKit when this file exists.
// Two caches:
//   lh-shell-v2-{version} — app bundle (pre-cached on install)
//   lh-plan-images-v1     — Supabase Storage plan images (cache-first)
//
// ⛔ WHAT IS NEVER CACHED (security review, 2026-09-27). The fallback below used
// to store EVERY successful GET in the shell cache — /api/* included: document
// lists, file downloads, photos, Dossier archive zips. They stayed on the
// device after logout and were served to whoever used it while offline. Now
// only this site's own pages and build files are cached; /api/* and other
// origins go straight to the network. The cache name gained `v2-` so the
// activate step below deletes every old cache, whatever the build version.

/// <reference types="@sveltejs/kit" />
// SvelteKit 3: `$service-worker` is gone. The build's files come from
// $app/manifest (paths relative to the base path, which is '' here) and the
// version from $app/env.
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
import { OCR_BASE } from '#lib/utils/textScan/ocrAssets.js';

const SHELL_CACHE  = `lh-shell-v2-${version}`;
const IMAGES_CACHE = 'lh-plan-images-v1';
// The text reader's files (number plates, door numbers): kept once fetched,
// so a scan works with no signal. Their path carries the reader's version, so
// an upgrade is new URLs; older versions are dropped on activate.
const OCR_CACHE    = 'lh-ocr-v1';

// Assets to pre-cache (app shell)
// $app/manifest gives paths RELATIVE to the base path ('' here), with no
// leading slash; the fetch handler compares against url.pathname, which has one.
const ASSETS = [...immutable, ...assets].map(f => '/' + f.path);

// -- Install: pre-cache app shell ---------------------------------------------

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// -- Activate: delete old shell caches ----------------------------------------

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('lh-shell-') && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => pruneOldReader())
  );
  self.clients.claim();
});

// -- Fetch: route requests to the right cache strategy ------------------------

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Plan images from Supabase Storage → cache-first. Only the public schematics
  // bucket: anything else in storage is not ours to keep on a device.
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/plan-images/')) {
    event.respondWith(cacheFirst(request, IMAGES_CACHE));
    return;
  }

  // Skip authenticated Supabase API calls — let them go straight to network.
  // Data is cached in localStorage by mobileplanStore, not here.
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

  // ⛔ Anything else from another origin, and anything from our own API, is
  // never cached: it is personal or permissioned data, not the app.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // The text reader's files → cache-first, kept across releases.
  if (url.pathname.startsWith(OCR_BASE)) {
    event.respondWith(cacheFirst(request, OCR_CACHE));
    return;
  }

  // App shell assets → cache-first (pre-cached on install)
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else → network-first with shell cache fallback
  event.respondWith(networkFirst(request));
});

/** Drop reader files from an older version (their path no longer matches). */
async function pruneOldReader() {
  const cache = await caches.open(OCR_CACHE);
  for (const req of await cache.keys()) {
    if (!new URL(req.url).pathname.startsWith(OCR_BASE)) await cache.delete(req);
  }
}

// -- Cache strategies ----------------------------------------------------------

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Offline', { status: 503 });
  }
}
