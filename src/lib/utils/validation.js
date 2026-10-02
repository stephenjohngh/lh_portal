// src/lib/utils/validation.js

/**
 * Form input checks. Only what a screen uses: eight more generic checks
 * (dates, URLs, phone numbers, ranges, a validator builder) were called by
 * nothing but their own tests, and were removed 2026-10-02.
 */

/**
 * Check if value is required (not empty/null/undefined)
 * @param {any} value - Value to check
 * @returns {boolean} True if value exists and is not empty
 */
export function isRequired(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
