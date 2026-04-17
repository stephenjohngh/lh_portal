// src/service-worker.js
// SvelteKit service worker — auto-registered by SvelteKit when this file exists.
// Two caches:
//   lh-shell-{version}   — app bundle (pre-cached on install)
//   lh-plan-images-v1    — Supabase Storage plan images (cache-first)

/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const SHELL_CACHE  = `lh-shell-${version}`;
const IMAGES_CACHE = 'lh-plan-images-v1';

// Assets to pre-cache (app shell)
const ASSETS = [...build, ...files];

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
    )
  );
  self.clients.claim();
});

// -- Fetch: route requests to the right cache strategy ------------------------

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Plan images from Supabase Storage → cache-first
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/')) {
    event.respondWith(cacheFirst(request, IMAGES_CACHE));
    return;
  }

  // Skip authenticated Supabase API calls — let them go straight to network.
  // Data is cached in localStorage by mobileplanStore, not here.
  if (url.hostname.endsWith('.supabase.co')) {
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
