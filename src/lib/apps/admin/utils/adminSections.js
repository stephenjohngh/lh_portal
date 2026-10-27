// src/lib/apps/admin/utils/adminSections.js
// Every Admin screen, and where it sits. One list: the left-hand navigation reads
// it, and AdminApp renders the screen whose id is active.
//
// Two levels. The left-hand list is SECTIONS, grouped by what they are for. A
// section with more than one screen shows them as a small tab strip across its
// top — those are its LEAVES. A leaf's id is what AdminApp renders. Admin had
// grown four tabs and a ten-item "Other Config" dropdown that mixed the
// building's own facts with the portal's behaviour (2026-10-27); screens that
// are one subject (the numbers the portal works to, the words it uses, the
// documents) now sit together instead of as ten peers.
//   People            who may use the portal
//   Building          what exists: the building, its floors and spaces, its component types
//   Portal settings   how the portal behaves (an operator changes these, not a developer)
//   Workflows         the processes that move records through steps
//   Records           what was done, and the documents
// Only Users is shown to a non-admin.

/** @typedef {{ id: string, label: string }} Leaf */
/** @typedef {{ id: string, icon: string, label: string, adminOnly?: boolean, leaves?: Leaf[] }} Section */
/** @type {Array<{ key: string, label: string, sections: Section[] }>} */
export const SECTION_GROUPS = [
  { key: 'people', label: 'People', sections: [
    { id: 'users', icon: '👥', label: 'Users' },
  ] },
  { key: 'building', label: 'Building', sections: [
    { id: 'identity', icon: '🏠', label: 'Building & business', adminOnly: true },
    { id: 'floors-spaces', icon: '🏢', label: 'Floors and spaces', adminOnly: true, leaves: [
      { id: 'floors', label: 'Floors' },
      { id: 'space-types', label: 'Space types' },
    ] },
    { id: 'types', icon: '🗂', label: 'Component types', adminOnly: true },
  ] },
  { key: 'settings', label: 'Portal settings', sections: [
    { id: 'apps', icon: '🧩', label: 'Apps in the top bar', adminOnly: true },
    { id: 'ai',   icon: '🤖', label: 'AI assistant',        adminOnly: true },
    { id: 'limits', icon: '📏', label: 'Limits and timing', adminOnly: true, leaves: [
      { id: 'due-windows',      label: 'Due windows' },
      { id: 'non-working-days', label: 'Non-working days' },
      { id: 'policies',         label: 'Policies' },
    ] },
    { id: 'wording', icon: '✍', label: 'Wording', adminOnly: true },
  ] },
  { key: 'workflows', label: 'Workflows', sections: [
    { id: 'workflows', icon: '🔀', label: 'Workflows', adminOnly: true },
  ] },
  { key: 'records', label: 'Records', sections: [
    { id: 'audit', icon: '📋', label: 'Audit logs', adminOnly: true },
    { id: 'documents-section', icon: '📁', label: 'Documents', adminOnly: true, leaves: [
      { id: 'documents',      label: 'Document library' },
      { id: 'doc-categories', label: 'Categories' },
    ] },
  ] },
];

const ALL_SECTIONS = SECTION_GROUPS.flatMap((g) => g.sections);

/** The screens of a section: its leaves, or the section itself when it has none. @param {Section} s @returns {Leaf[]} */
export function leavesOf(s) {
  return s.leaves ?? [{ id: s.id, label: s.label }];
}

/** Every screen id AdminApp renders, in order. */
export const SCREEN_IDS = ALL_SECTIONS.flatMap((s) => leavesOf(s).map((l) => l.id));

/** The section a screen belongs to. @param {string} screenId @returns {Section|undefined} */
export function sectionOf(screenId) {
  return ALL_SECTIONS.find((s) => leavesOf(s).some((l) => l.id === screenId));
}

/** The screens that need the building's type hierarchy loaded first. */
export const NEEDS_BUILDING_DATA = ['types', 'floors', 'space-types'];
