// src/lib/server/publicStatus.js
//
// The public status answer for any process (migration 261): an item's
// reference and its code → which step it is at, in the words the public is
// meant to see. ⛔ No login, so it is read with the service role, and only
// through workflow_public_status(), which answers only for a workflow an
// administrator has switched on (Admin → Workflows → Public status page) and
// returns the step's public name, the process's name and two dates — never a
// person, a note, a field or a deadline.

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { normalizeVerificationCode } from '#lib/utils/caseVerificationCode.js';

/** @type {any} */
let svc = null;
const db = () => (svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

/** A reference the public may type: PKR-2026-000012, CMP-…, CAS-…. */
export const PUBLIC_REFERENCE = /^[A-Z]{2,6}-\d{4}-\d{6}$/;

/**
 * Where an item stands, or null when nothing switched on matches the pair —
 * a wrong code, a wrong reference and a process switched off read the same.
 * @param {unknown} reference @param {unknown} code
 * @returns {Promise<null | { reference: string, process: string, stage: string, finished: boolean, received: string, updated: string }>}
 */
export async function publicStatus(reference, code) {
  const ref = String(reference ?? '').trim().toUpperCase();
  const clean = normalizeVerificationCode(String(code ?? ''));
  if (!clean || !PUBLIC_REFERENCE.test(ref)) return null;
  const { data, error } = await db().rpc('workflow_public_status', { p_reference: ref, p_code: clean });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    reference: data.reference, process: data.process, stage: data.stage,
    finished: data.kind === 'done' || data.kind === 'declined',
    received: data.received, updated: data.updated,
  };
}
