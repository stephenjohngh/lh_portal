// src/lib/apps/parking/stores/registrationCheck.js
//
// One registration lookup, across the car park and the road permits — used by
// the Parking app's Registration Lookup and by the Car check page
// (/parking/check, 2026-10-17), so the two can never answer differently.
// It searches what the page has loaded, so it works with no signal; the audit
// line (parkingStore.lookupRegistration) waits on the phone until the signal
// returns (lookupAudit.js).

import { get } from 'svelte/store';
import { parkingStore } from './parkingStore.js';
import { permitStore } from './permitStore.js';
import { findPermitsByRegistration } from '../utils/permitModel.js';
import { today, fmtTime } from '#lib/utils/dates.js';
import { errMessage } from '#lib/utils/errors.js';

/**
 * @param {string} q  the registration, typed or scanned, any spacing or case
 * @param {{ offline?: boolean }} [opts]
 * @returns {Promise<{ hits: any[], permitHits: any[], permitError: string }>}
 */
export async function checkRegistration(q, { offline = false } = {}) {
  let permitHits = [];
  let permitError = '';
  try {
    await permitStore.ensureLoaded();
    permitHits = findPermitsByRegistration(q, get(permitStore).permits, today(), fmtTime(new Date().toISOString()));
  } catch (/** @type {any} */ err) {
    permitError = errMessage(err, 'The road permits could not be read.');
  }
  const hits = parkingStore.lookupRegistration(q, permitHits.length, { offline });
  return { hits, permitHits, permitError };
}
