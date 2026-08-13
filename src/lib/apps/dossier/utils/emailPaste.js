// src/lib/apps/dossier/utils/emailPaste.js
// Turning a pasted email thread into correspondence rows — pure, Type-1 testable.
//
// The parsing itself is NOT redone here: `$lib/utils/emailParser` already reads
// Outlook and Gmail headers, and it is used by the Management app's activity
// log. This module adds the two things a correspondence table needs and an
// activity note does not:
//
//   1. SPLITTING. parseEmailPaste() deliberately returns only the topmost
//      message of a thread — right for "log this reply", wrong here. A briefing
//      pack's correspondence table IS the chain, so a pasted thread should
//      become one row per message, oldest first.
//   2. MAPPING onto the correspondence template's field keys.
//
// Nothing is discarded silently. A message that cannot be parsed is reported
// as skipped rather than dropped, so the author can see the count did not match
// what they pasted and paste that part again by hand.

import { parseEmailPaste } from '$lib/utils/emailParser';
import { coerceRecordFields } from './datasetTemplates.js';

/**
 * Separators that mark the start of an earlier message in a thread.
 *
 * The same set emailParser recognises, minus the bare `From:` heuristic —
 * splitting needs the boundary position, and a `From:` line that is part of the
 * FIRST message's header block must not be treated as one. That case is handled
 * separately below.
 */
const THREAD_SEPARATORS = [
  /^-{2,}\s*(?:original|forwarded) message\s*-{2,}\s*$/gim,
  /^_{10,}\s*$/gm,
  /^on .{5,200}\bwrote:\s*$/gim,
];

/** A `From:` at the start of a line — the Outlook thread boundary. */
const FROM_LINE = /^from:\s*.+$/gim;

/**
 * Every boundary offset in the text, in order, deduplicated.
 * @param {string} text
 * @returns {number[]}
 */
function boundaryOffsets(text) {
  const offsets = new Set();

  for (const pattern of THREAD_SEPARATORS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // Index 0 is not a boundary — it would produce an empty first segment.
      if (match.index > 0) offsets.add(match.index);
    }
  }

  // Outlook stacks header blocks with no separator between them. Every `From:`
  // after the first begins a new message; the first one belongs to the message
  // already in progress.
  const fromMatches = [...text.matchAll(FROM_LINE)];
  for (const match of fromMatches.slice(1)) {
    if (match.index > 0) offsets.add(match.index);
  }

  return [...offsets].sort((a, b) => a - b);
}

/**
 * Split a pasted thread into message blocks, newest first (as pasted).
 *
 * Returns a single-element array when there is nothing to split, so callers do
 * not need a special case for one email.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitEmailThread(text) {
  if (!text || !text.trim()) return [];

  // Quote markers first: a thread quoted with "> " has its separators prefixed
  // too, and they would not match.
  const normalised = text.split('\n').map(l => l.replace(/^>+\s?/, '')).join('\n');

  const offsets = boundaryOffsets(normalised);
  if (!offsets.length) return [normalised.trim()].filter(Boolean);

  const segments = [];
  let start = 0;
  for (const offset of [...offsets, normalised.length]) {
    const segment = normalised.slice(start, offset).trim();
    if (segment) segments.push(segment);
    start = offset;
  }
  return segments;
}

/**
 * Map one parsed email onto the correspondence template's fields.
 *
 * The subject line fills `subject` — the column a reader scans, which the
 * author is then free to rewrite into something more useful than the sender's
 * wording. The body fills `body` IN FULL and renders on a line of its own: it
 * is the author's evidence, and cutting it to fit anything would lose text they
 * can no longer see. Runs of blank lines are collapsed, which is formatting
 * rather than content.
 *
 * @param {{from?: string, to?: string, subject?: string,
 *          email_date?: string, body?: string}} parsed
 */
export function emailToCorrespondence(parsed) {
  return coerceRecordFields('correspondence', {
    date:    parsed?.email_date ?? '',
    from:    parsed?.from ?? '',
    to:      parsed?.to ?? '',
    subject: parsed?.subject ?? '',
    body:    String(parsed?.body ?? '').replace(/\n{3,}/g, '\n\n').trim(),
  });
}

/** Identity of a message, for dropping the duplicates a thread repeats. */
function rowKey(fields) {
  return [fields.date, fields.from, fields.subject, fields.body.slice(0, 200)]
    .join('|').toLowerCase();
}

/** True when a row has nothing an author could use. */
function isUseless(fields) {
  return !fields.from && !fields.subject && !fields.body;
}

/**
 * Parse a pasted thread into correspondence rows.
 *
 * Rows come back OLDEST FIRST — the order a chronology-shaped table wants, and
 * the reverse of how a mail client stacks a thread.
 *
 * @param {string} text
 * @returns {{ rows: object[], skipped: number, total: number }}
 */
export function parsePastedEmails(text) {
  const segments = splitEmailThread(text);
  const rows = [];
  const seen = new Set();
  let skipped = 0;

  for (const segment of segments) {
    const parsed = parseEmailPaste(segment);
    if (!parsed) { skipped++; continue; }

    const fields = emailToCorrespondence(parsed);
    if (isUseless(fields)) { skipped++; continue; }

    const key = rowKey(fields);
    if (seen.has(key)) continue;      // a repeat, not a failure — not "skipped"
    seen.add(key);
    rows.push(fields);
  }

  return { rows: rows.reverse(), skipped, total: segments.length };
}

/** One line describing what a parse found, for the modal's summary. */
export function describePasteResult({ rows = [], skipped = 0 } = {}) {
  if (!rows.length) {
    return skipped
      ? 'Nothing here looks like an email. Check the paste includes the From/To/Subject lines.'
      : 'Nothing to read yet — paste an email or a thread above.';
  }
  const found = `${rows.length} message${rows.length === 1 ? '' : 's'}`;
  return skipped
    ? `${found} — ${skipped} part${skipped === 1 ? '' : 's'} could not be read and ${skipped === 1 ? 'was' : 'were'} left out.`
    : found;
}
