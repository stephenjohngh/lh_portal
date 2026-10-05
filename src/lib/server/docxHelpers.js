// The shared Word-document helpers moved to #lib/docx/docxHelpers.js
// (2026-10-05), because the Building Assets report is now built in the browser
// and a browser may not import from $lib/server. Server reports keep importing
// from here.
export * from '#lib/docx/docxHelpers.js';
