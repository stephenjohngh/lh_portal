// src/lib/utils/currentUser.js
//
// Who is signed in, for a created_by / updated_by stamp — ONE way
// (2026-10-03, PROJECT_STATUS §6bbb item 7).
//
// About thirty places asked supabase.auth.getUser(), and nine more had written
// their own helper. getUser() is a round trip to the auth server on EVERY
// save, and it fails offline. This reads the session the browser already
// holds, which is what Inspection and Maintenance did on purpose (an offline
// walk must still stamp who did it). Nothing is weakened: the database checks
// the real token on every write, and RLS decides what it may do.
//
// ⚠ There is no fallback to getUser(): with no session there is no token to
// send it, so it could only fail more slowly.
//
// Reading in a component's markup: use $auth.user (the auth store), which is
// reactive. These are for code that is about to write.

import { supabase } from '$lib/supabaseClient';

/**
 * The signed-in user, or null.
 * @returns {Promise<{ id: string, email?: string } | null>}
 */
export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user ?? null;
}

/** The signed-in user's id, or null. */
export async function currentUserId() {
  return (await currentUser())?.id ?? null;
}

/**
 * The signed-in user's id, for a write that must be attributed.
 * @throws {Error} when nobody is signed in — an unattributed row is worse
 *   than a refused one.
 */
export async function requireUserId() {
  const id = await currentUserId();
  if (!id) throw new Error('You are not signed in. Sign in again and retry.');
  return id;
}
