<!-- src/lib/components/common/AppGate.svelte
     The start of every app, written once (2026-10-02, PROJECT_STATUS §6aaa item 3).

     It runs the permission check, then the app's opening load, and shows the
     shared spinner until BOTH have finished. Only then is the app drawn.

     ⛔ Why: a store starts as `{ items: [], loading: false }`, so before its
     first load "not read yet" and "read, and empty" look the same. Ten shells
     showed "No … yet", a count of 0, or "Not covered" on every row while
     their data was still arriving, and each had written its own fix (§6zz).

     ⛔ Where the app needs a grant (`requireGrant`), an account without one
     sees a plain sentence saying so, never an empty app and never an error.
     The check waits for permissions.init: before it `isAdmin` reads false,
     and the admin saw "no access" flash on every open (0bafc45).

     A failed load shows its error above the app; the app is still drawn, so
     its own error state and anything already loaded stay reachable. -->
<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { auth } from '#lib/stores/auth.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { hasAppAccess } from '#lib/utils/appAccess.js';
  import { errMessage } from '#lib/utils/errors.js';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorDisplay from './ErrorDisplay.svelte';

  /** The app id in `app_permissions` and `apps.js`. */
  export let appId;
  /** The app's name as a person reads it, e.g. "Parking". */
  export let name;
  /** The app's opening data. Not run for an account without access. */
  /** @type {null | (() => Promise<unknown>)} */
  export let load = null;
  /** Show "you do not have access" to an account the app is not granted to. */
  export let requireGrant = false;
  /** The spinner's line; "Loading <name>…" when not given. */
  export let loadingText = '';
  /** The data is already in memory from an earlier visit: draw the app at
   *  once and run the check and the load behind it. Only for an app that
   *  needs no grant — a no-access answer must never follow a drawn app. */
  export let alreadyLoaded = false;

  /** OUT, for `bind:ready`: true once the check and the load have finished —
   *  for anything the shell draws outside the gate, such as a header count. */
  export let ready = false;

  let checked = false;
  let loadError = '';

  $: allowed = !requireGrant || hasAppAccess($permissions, appId);

  onMount(async () => {
    try {
      const user = get(auth).user;
      if (user) await permissions.init(user.id, appId);
    } catch (/** @type {any} */ err) {
      loadError = errMessage(err, 'Your permissions could not be checked.');
    } finally {
      checked = true;
    }
    try {
      // The store itself, not `allowed`: straight after an await a $:
      // statement may not have caught up.
      if (load && (!requireGrant || hasAppAccess(get(permissions), appId))) await load();
    } catch (/** @type {any} */ err) {
      loadError = errMessage(err, `${name} could not be loaded.`);
    } finally {
      ready = true;
    }
  });
</script>

{#if !(alreadyLoaded && !requireGrant) && (!checked || (allowed && !ready))}
  <LoadingSpinner text={loadingText || `Loading ${name.toLowerCase()}…`} />
{:else if !allowed}
  <!-- Not an error: the app has not been granted to this account. -->
  <p class="rounded-lg border border-slate-600/50 bg-slate-800/30 p-6 text-center text-sm text-slate-400">
    You do not have access to {name}. An administrator can grant it under Admin → Users.
  </p>
{:else}
  {#if loadError}<ErrorDisplay message={loadError} className="mb-4" />{/if}
  <slot />
{/if}
