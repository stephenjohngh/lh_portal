// src/routes/api/monitoring/+server.js
//
// Sentry tunnel. The browser SDK is configured with tunnel: '/api/monitoring'
// (see hooks.client.js), so it POSTs error envelopes to this same-origin URL
// instead of directly to *.ingest.sentry.io. Ad/tracker blockers (uBlock,
// Privacy Badger, etc.) block by host, so a same-origin request slips past
// them — which is the whole point: client errors from users running blockers
// now actually reach Sentry.
//
// The route is deliberately named "monitoring" (not "sentry") because some
// blocklists also match the word "sentry" in a URL path.
//
// Security: this is NOT an open proxy. The envelope's embedded DSN must match
// our own configured PUBLIC_SENTRY_DSN (same host + project id) or the request
// is rejected — so it can only ever forward to our Sentry project, never an
// arbitrary host (no SSRF). The DSN is public by design, so this exposes
// nothing the client bundle didn't already.

import { env } from '$env/dynamic/public';

/** Parse the configured DSN into the host + project id we're allowed to forward to. */
function allowedTarget() {
  const dsn = env.PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    return { host: u.host, projectId: u.pathname.replace(/^\//, '') };
  } catch {
    return null;
  }
}

export async function POST({ request }) {
  const allowed = allowedTarget();
  if (!allowed) return new Response('Sentry not configured', { status: 503 });

  const body = await request.arrayBuffer();

  // The first newline-delimited line of a Sentry envelope is a JSON header
  // that carries the DSN the SDK intended to send to.
  const firstLine = new TextDecoder().decode(body.slice(0, 2048)).split('\n', 1)[0];
  let header;
  try {
    header = JSON.parse(firstLine);
  } catch {
    return new Response('Invalid envelope', { status: 400 });
  }

  let dsnUrl;
  try {
    dsnUrl = new URL(header.dsn);
  } catch {
    return new Response('Invalid DSN', { status: 400 });
  }

  const projectId = dsnUrl.pathname.replace(/^\//, '');
  // Only forward to OUR project/host — never an attacker-supplied destination.
  if (dsnUrl.host !== allowed.host || projectId !== allowed.projectId) {
    return new Response('Forbidden', { status: 403 });
  }

  const upstream = `https://${allowed.host}/api/${projectId}/envelope/`;
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    });
    return new Response(null, { status: res.status });
  } catch {
    // Don't surface relay failures to the page — error reporting must never
    // break the app.
    return new Response(null, { status: 502 });
  }
}
