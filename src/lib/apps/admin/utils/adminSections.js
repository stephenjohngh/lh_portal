// src/lib/apps/admin/utils/adminSections.js
// Every Admin screen, and the group it belongs to. One list: the left-hand
// navigation reads it, and AdminApp renders the section whose id is active.
//
// Groups are by what a screen is FOR, not by when it was built — Admin had grown
// four tabs and a ten-item "Other Config" dropdown that mixed the building's own
// facts with the portal's behaviour (2026-10-27).
//   People            who may use the portal
//   Building          what exists: the building, its floors, spaces and component types
//   Portal settings   how the portal behaves (an operator changes these, not a developer)
//   Workflows         the processes that move records through steps
//   Records           what was done, and the documents
// Only Users is shown to a non-admin.

/** @typedef {{ id: string, icon: string, label: string, adminOnly?: boolean }} Section */
/** @type {Array<{ key: string, label: string, sections: Section[] }>} */
export const SECTION_GROUPS = [
  { key: 'people', label: 'People', sections: [
    { id: 'users', icon: '👥', label: 'Users' },
  ] },
  { key: 'building', label: 'Building', sections: [
    { id: 'identity',    icon: '🏠', label: 'Building & business', adminOnly: true },
    { id: 'floors',      icon: '🏢', label: 'Floors',              adminOnly: true },
    { id: 'space-types', icon: '🏷', label: 'Space types',         adminOnly: true },
    { id: 'types',       icon: '🗂', label: 'Component types',     adminOnly: true },
  ] },
  { key: 'settings', label: 'Portal settings', sections: [
    { id: 'apps',             icon: '🧩', label: 'Apps in the top bar', adminOnly: true },
    { id: 'ai',               icon: '🤖', label: 'AI assistant',        adminOnly: true },
    { id: 'policies',         icon: '📏', label: 'Policies',            adminOnly: true },
    { id: 'due-windows',      icon: '⏳', label: 'Due windows',         adminOnly: true },
    { id: 'non-working-days', icon: '📅', label: 'Non-working days',    adminOnly: true },
    { id: 'wording',          icon: '✍',  label: 'Wording',             adminOnly: true },
    { id: 'doc-categories',   icon: '🗃', label: 'Document categories', adminOnly: true },
  ] },
  { key: 'workflows', label: 'Workflows', sections: [
    { id: 'workflows', icon: '🔀', label: 'Workflows', adminOnly: true },
  ] },
  { key: 'records', label: 'Records', sections: [
    { id: 'audit',     icon: '📋', label: 'Audit logs',       adminOnly: true },
    { id: 'documents', icon: '📁', label: 'Document library', adminOnly: true },
  ] },
];

/** Every section id, in order. */
export const SECTION_IDS = SECTION_GROUPS.flatMap((g) => g.sections.map((s) => s.id));

/** The sections that need the building's type hierarchy loaded first. */
export const NEEDS_BUILDING_DATA = ['types', 'floors', 'space-types'];
