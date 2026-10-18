// src/lib/server/parkingApply.js
//
// The public parking application (2026-10-17, migration 247), server side:
// what the form shows (the privacy notice an admin set, the building and
// business names, whether applications are open) and saving one. ⛔ The page
// has no login, so everything is read and written here with the service role,
// and through the database functions made for it: parking_request_submit()
// (which starts the item in its workflow) and, for the status page, the one
// public status answer (publicStatus.js, migration 261).

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { getIdentity } from '#lib/server/identity.js';
import { serverWording } from '#lib/server/wording.js';
import { generateVerificationCode, formatVerificationCode } from '#lib/utils/caseVerificationCode.js';
import { applicationProblems, applicationRow } from '#lib/apps/parking/utils/applicationForm.js';
import { APPLICATION_WORKFLOW_KEY } from '#lib/apps/parking/utils/applicationWorkflow.js';
import { publicStatus } from '#lib/server/publicStatus.js';

/** @type {any} */
let svc = null;
const db = () => (svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

/** The privacy notice in force, filled with this building's names. */
export async function privacyNotice() {
  const { building, organisation } = await getIdentity();
  return serverWording('parkingApplyPrivacyNotice', {
    business: organisation.name ?? 'The building’s managers', building: building.name,
  });
}

/** What the public form shows. */
export async function applyFormContext() {
  const [{ building }, notice, wf] = await Promise.all([
    getIdentity(),
    privacyNotice(),
    db().from('workflows').select('id').eq('key', APPLICATION_WORKFLOW_KEY).maybeSingle(),
  ]);
  if (wf.error) throw new Error(wf.error.message);
  return { buildingName: building.name, privacyNotice: notice, open: !!wf.data };
}

/**
 * Save an application. Throws an Error whose `status` is 400 (with `fields`)
 * when the form is wrong.
 * @param {Record<string, any>} body
 * @returns {Promise<{ reference: string, code: string }>}
 */
export async function submitApplication(body) {
  const problems = applicationProblems(body);
  if (Object.keys(problems).length) {
    throw Object.assign(new Error('Some answers need changing.'), { status: 400, fields: problems });
  }
  const code = generateVerificationCode();
  // The notice as the SERVER has it now — never the page's copy.
  const notice = await privacyNotice();
  const { data, error } = await db().rpc('parking_request_submit', {
    p: { ...applicationRow(body), privacy_notice_text: notice }, p_code: code,
  });
  if (error) {
    throw Object.assign(new Error(/not open/i.test(error.message) ? 'Applications are not open yet.' : 'Your application could not be saved. Please try again.'),
      { status: /not open/i.test(error.message) ? 409 : 500, cause: error });
  }
  return { reference: String(data), code: formatVerificationCode(code) };
}

/**
 * Where an application has got to: its reference, the step's public name,
 * whether it is finished, and when it was received and last moved — or null
 * when the reference and code do not match.
 * @param {string} reference @param {string} code
 */
export async function applicationStatus(reference, code) {
  // ⭐ Through the one public status answer (migration 261): it answers only
  // while the application workflow's public status page is switched on in
  // Admin → Workflows, and in the step's public words.
  const status = await publicStatus(reference, code);
  if (!status) return null;
  const { process, ...rest } = status;
  return rest;
}
