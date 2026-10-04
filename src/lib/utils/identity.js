// src/lib/utils/identity.js
//
// Who the portal is FOR — the building and the business running it — as an
// admin sets them (Admin → Other Config → Building & business), never as code.
// User, 2026-10-03: "things that can change e.g. business address, ai models,
// management preferences should have an admin parameter". Logo and colours are
// deployment branding and are NOT here (#lib/branding.js, #lib/theme.js).
//
// Two homes, because they are two things:
//   · the BUILDING is the `facilities` row (name, short name, address) — the
//     one building there is (CLAUDE.md, standing decisions);
//   · the BUSINESS and the letters' signatory are portal_settings.organisation.
//
// ⛔ An unset field reads as a bracketed placeholder ("[Building name]"), the
// convention the draft letters already use for what a person must fill in. A
// document that guessed — the code used to default to "Lancaster House" in some
// files and "Lonsdale House" in others — would carry a wrong name silently.
//
// Pure: imports nothing, so the browser and the server share it.

export const ORGANISATION_KEY = 'organisation';

/** The business and letter fields, with the placeholder each shows when unset. */
export const ORGANISATION_FIELDS = Object.freeze([
  { key: 'name',            label: 'Business name',            placeholder: '[Business name]' },
  { key: 'address',         label: 'Business address',         placeholder: '[Business address]', multiline: true },
  { key: 'email',           label: 'Contact email',            placeholder: '[Contact email]' },
  { key: 'phone',           label: 'Contact phone',            placeholder: '[Contact phone]' },
  { key: 'signatoryName',   label: 'Letters signed by — name', placeholder: '[Building Safety Manager name]' },
  { key: 'signatoryRole',   label: 'Letters signed by — role', placeholder: 'Building Safety Manager' },
  { key: 'signatoryContact', label: 'Letters signed by — contact details', placeholder: '[BSM email · BSM phone]' },
]);

/**
 * Only the known fields, trimmed; an empty field is dropped, so it reads as unset.
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function cleanOrganisation(value) {
  const v = value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const { key } of ORGANISATION_FIELDS) {
    const s = typeof v[key] === 'string' ? v[key].trim() : '';
    if (s) out[key] = s;
  }
  return out;
}

/**
 * Every organisation field, the placeholder standing in for an unset one.
 * @param {unknown} value
 */
export function organisationOrPlaceholders(value) {
  const set = cleanOrganisation(value);
  return Object.fromEntries(ORGANISATION_FIELDS.map(({ key, placeholder }) => [key, set[key] ?? placeholder]));
}

/**
 * The building's name, or the placeholder.
 * @param {{ name?: string|null } | null | undefined} building  the facilities row
 */
export function buildingName(building) {
  const n = typeof building?.name === 'string' ? building.name.trim() : '';
  return n || '[Building name]';
}
