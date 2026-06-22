// src/lib/utils/prefs.js
// Tiny helpers for per-browser UI preferences in localStorage (last-viewed
// section, active filter, etc.). All access is wrapped in try/catch so it's
// safe under SSR, private-mode, and quota errors.
//
// Browser-local only — for anything that must follow the user across devices,
// store it in the database instead.

/**
 * Read a string preference.
 * @param {string} key
 * @param {string|null} [fallback]
 * @returns {string|null}
 */
export function getPref(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Write a string preference; a null/undefined value clears it.
 * @param {string} key
 * @param {string|null|undefined} value
 */
export function setPref(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch { /* ignore */ }
}

/**
 * Read + JSON-parse a preference.
 * @param {string} key
 * @param {*} [fallback]
 */
export function getJSON(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

/**
 * JSON-stringify + write a preference.
 * @param {string} key
 * @param {*} value
 */
export function setJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}
