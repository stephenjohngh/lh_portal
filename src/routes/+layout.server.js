// src/routes/+layout.server.js
// The deployed commit, read at RUNTIME.
//
// ── Why this exists separately from kit.version.name ────────────────────────
// Two different jobs that look like one.
//
// `kit.version.name` (svelte.config.js) is the app's BUILD identity. SvelteKit
// hashes it to namespace `globalThis.__sveltekit_<hash>`, which the SSR'd HTML
// defines and the client chunks read — so it must be identical across every
// evaluation of the config in a build, and it can only ever come from something
// the build itself can see.
//
// The footer wants a different thing: which commit is actually deployed. On
// Northflank that is a RUNTIME fact — NF_DEPLOYMENT_SHA is injected into the
// container, never into the build — so no amount of work in svelte.config.js
// can reach it, and trying is what produced `vnogit-1.0.0`.
//
// Read here, where runtime env is available, and handed to the page. Only the
// short SHA crosses to the client: $env/dynamic/private can read anything in
// the environment, so what leaves the server is chosen explicitly rather than
// by a naming convention.

import { env } from '$env/dynamic/private';

/** @type {import('./$types').LayoutServerLoad} */
export function load() {
  const sha =
    env.NF_DEPLOYMENT_SHA     // Northflank, injected at runtime
    ?? env.COMMIT_REF         // Netlify, also present at runtime
    ?? env.PUBLIC_BUILD_SHA   // the manual escape hatch
    ?? env.GIT_COMMIT
    ?? '';

  return { deployedSha: sha ? String(sha).slice(0, 7) : null };
}
