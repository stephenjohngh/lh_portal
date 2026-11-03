// src/lib/utils/shortName.js
// A person's SHORT NAME — initials such as "SP" (migration 279). Set by an admin;
// Management shows it for meeting attendees and action assignees. The database
// holds the same rule (profiles_short_name_check + a unique index ignoring case);
// this copy says why BEFORE the save is refused.

/** Letters, digits, dots and hyphens; 1 to 10 of them. Must match the CHECK in 279. */
export const SHORT_NAME_PATTERN = /^[A-Za-z0-9.-]{1,10}$/;

/** What is stored: trimmed, or null for none. @param {string|null|undefined} v */
export function normaliseShortName(v) {
  const t = String(v ?? '').trim();
  return t ? t : null;
}

/**
 * Why this short name cannot be saved for this person, or '' when it can.
 * @param {string|null|undefined} value
 * @param {Array<{ id: string, short_name?: string|null, full_name?: string|null, email?: string }>} people
 * @param {string} selfId
 */
export function shortNameProblem(value, people, selfId) {
  const v = normaliseShortName(value);
  if (!v) return '';
  if (!SHORT_NAME_PATTERN.test(v)) return 'Use up to 10 letters, numbers, dots or hyphens — no spaces.';
  const clash = (people ?? []).find((p) => p.id !== selfId && p.short_name && p.short_name.toUpperCase() === v.toUpperCase());
  return clash ? `${clash.full_name || clash.email || 'Someone else'} already has the short name ${clash.short_name}.` : '';
}
