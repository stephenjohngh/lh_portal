// src/lib/theme.js
// LH Portal colour theme — single source of truth.
//
// Import from:
//   Tailwind config  →  './src/lib/theme.js'  (relative, Node.js context)
//   SvelteKit files  →  '$lib/theme.js'        (SvelteKit alias)
//
// Do NOT use $app / $env / SvelteKit-specific imports here.

// ── Main accent palette (maps to Tailwind's 'purple-*' slots) ──────────────
// Base: RGB(60, 150, 131) = #3c9683 (portal teal, overrides Tailwind purple)
export const ACCENT_PALETTE = {
  50:  '#f1f8f6',
  100: '#e2efec',
  200: '#bbdad4',
  300: '#94c5bb',
  400: '#6db0a2',
  500: '#3c9683',
  600: '#307869',
  700: '#245a4f',
  800: '#183c34',
  900: '#0c1e1a',
  950: '#060f0d',
};

// ── Semantic aliases ────────────────────────────────────────────────────────
export const ACCENT         = '#3c9683';   // purple-500 — primary portal accent
export const ACCENT_LIGHT   = '#6db0a2';   // purple-400
export const ACCENT_LIGHTER = '#94c5bb';   // purple-300
export const ACCENT_DARK    = '#307869';   // purple-600
export const ACCENT_DARKER  = '#245a4f';   // purple-700
export const ACCENT_BG      = '#0c1e1a';   // purple-900 — very dark teal bg

// RGB triplet — use with CSS alpha syntax: rgb(var(--lh-accent-rgb) / 0.1)
export const ACCENT_RGB = '60 150 131';

// ── Sub-app accent colours ──────────────────────────────────────────────────
// These are intentionally NOT in the Tailwind palette (scoped CSS only).
export const INSPECTION_ACCENT = '#fb923c';   // orange-400 — Inspection app
export const MOBILEPLAN_ACCENT = '#2dd4bf';   // teal-400  — Mobile Plan app
