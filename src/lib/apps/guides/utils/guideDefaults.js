// src/lib/apps/guides/utils/guideDefaults.js
// What the Guides app starts with. These are SEEDS, not rules (an app to deploy, not to
// edit): an admin renames, adds and retires categories on the Manage tab, and the app adds
// the shipped ones only when the table is empty, never over an admin's own list.

export const DEFAULT_CATEGORIES = [
  { key: 'daily',      name: 'Daily routine' },
  { key: 'waste',      name: 'Waste and recycling' },
  { key: 'lighting',   name: 'Lighting' },
  { key: 'fire',       name: 'Fire safety systems' },
  { key: 'cleaning',   name: 'Cleaning' },
  { key: 'emergency',  name: 'Emergencies' },
  { key: 'contractors', name: 'Visitors and contractors' },
];

/** A new guide starts as this — the author types the real title straight away. */
export const NEW_GUIDE_TITLE = 'Untitled guide';
export const NEW_STEP_TITLE = 'New step';
