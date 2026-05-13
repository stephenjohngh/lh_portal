// src/lib/utils/emailParser.js
//
// Parses pasted text to detect email content and extract structured fields.
// When a thread is detected, only the latest (topmost) message is returned.
//
// Used by the email activity type paste handler in ActivityLogSection and
// ActivityItem. Returns null for text that doesn't look like an email, so
// the default paste behaviour is preserved for all other input.

/**
 * Attempt to parse pasted text as an email (possibly a thread excerpt).
 *
 * Handles the two most common formats:
 *   - Outlook: headers (From/Sent/To/Subject) at the top of each message block
 *   - Gmail:   plain body followed by "On [date] [person] wrote:" quote marker
 *
 * @param {string} text - Raw pasted text
 * @returns {{ from, to, subject, email_date, body, wasThread } | null}
 */
export function parseEmailPaste(text) {
  if (!text || text.trim().length < 20) return null;

  // ── 1. Strip quote markers ────────────────────────────────────────
  // Some clients prefix every line of a forwarded block with "> ".
  // Strip these up-front so all subsequent patterns work uniformly.
  const normalised = text.split('\n').map(l => l.replace(/^>+\s?/, '')).join('\n');

  // ── 2. Detection ──────────────────────────────────────────────────
  // Needs at least 2 recognisable header-style lines, OR a Gmail-style
  // "On [date] wrote:" separator.  This threshold avoids false positives on
  // prose that happens to contain "To:" or "Subject:".
  const headerCount = ['from:', 'to:', 'subject:', 'date:', 'sent:'].filter(
    h => new RegExp('^' + h, 'im').test(normalised)
  ).length;

  const hasGmailSep = /^on .{5,120}\bwrote:\s*$/im.test(normalised);

  if (headerCount < 2 && !hasGmailSep) return null;

  // ── 3. Isolate the latest message ─────────────────────────────────
  let workingText = normalised;
  let wasThread   = false;

  // Outlook threads: the second "From:" line at the start of a line signals
  // the beginning of the previous message in the chain.
  const fromMatches = [...text.matchAll(/^from:\s*.+/gim)];
  if (fromMatches.length >= 2 && fromMatches[1].index > 30) {
    workingText = text.slice(0, fromMatches[1].index).trimEnd();
    wasThread   = true;
  }

  if (!wasThread) {
    // Explicit thread separators (Outlook dashes, underscores, Gmail marker)
    const SEPS = [
      /^-{4,}\s*(?:original|forwarded) message\s*-{4,}/im,
      /^_{10,}$/m,
      /^on .{5,120}\bwrote:\s*$/im,
    ];
    for (const sep of SEPS) {
      const m = sep.exec(text);
      if (m && m.index > 20) {
        workingText = text.slice(0, m.index).trimEnd();
        wasThread   = true;
        break;
      }
    }
  }

  // ── 4. Parse header fields ────────────────────────────────────────
  const get = re => (re.exec(workingText)?.[1] ?? '').trim();

  const fromRaw  = get(/^from:\s*(.+)/im);
  const toRaw    = get(/^to:\s*(.+)/im);
  const subject  = get(/^subject:\s*(.+)/im);
  const dateRaw  = get(/^(?:date|sent):\s*(.+)/im);

  // ── 5. Extract body ───────────────────────────────────────────────
  // Find the contiguous header block. It may be preceded by body text
  // (Outlook reply layout), so we keep scanning past leading non-header
  // lines rather than giving up at the first one.
  const workingLines = workingText.split('\n');
  const HEADER_LINE  = /^(?:from|to|cc|bcc|subject|date|sent|reply-to):\s*.+/i;

  let headerStart = -1;  // index of first header line found
  let headerEnd   = -1;  // index of last header line (or trailing blank)

  for (let i = 0; i < Math.min(workingLines.length, 40); i++) {
    const trimmed = workingLines[i].trim();
    if (HEADER_LINE.test(trimmed)) {
      if (headerStart === -1) headerStart = i;
      headerEnd = i;
    } else if (headerStart !== -1) {
      // Already inside the header block.
      // A blank line marks its end; any other line stops the scan.
      if (trimmed === '') headerEnd = i;
      break;
    }
    // Non-header, non-blank lines BEFORE the header block: keep scanning.
  }

  let body = '';

  if (headerEnd >= 0) {
    // Primary: everything that follows the header block.
    body = workingLines.slice(headerEnd + 1).join('\n').trim();

    // Fallback (Outlook-style reply: body sits ABOVE the header block):
    // if nothing follows the headers, use whatever preceded them.
    if (!body && headerStart > 0) {
      body = workingLines.slice(0, headerStart).join('\n').trim();
    }
  } else {
    // No header block found — treat entire working text as body, stripping
    // quote-marker lines.
    body = workingLines.filter(l => !l.startsWith('>')).join('\n').trim();
  }

  // Final pass: strip any header-format lines that remain in the body
  // (catches no-space headers like "From:stephen" missed by earlier scan).
  body = body
    .split('\n')
    .filter(l => !HEADER_LINE.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')   // collapse runs of blank lines left behind
    .trim();

  return {
    from:       extractDisplay(fromRaw),
    to:         extractDisplay(toRaw),
    subject,
    email_date: toISODate(dateRaw),
    body,
    wasThread
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract a display name from a raw From/To header value.
 * "John Doe <john@example.com>" → "John Doe"
 * "john@example.com"            → "john@example.com"
 * Multiple recipients           → first only
 */
function extractDisplay(raw) {
  if (!raw) return '';
  // Take only the first recipient (before ; or next comma-separated address)
  const first = raw.split(/[;]/)[0].trim();
  const m = first.match(/^"?(.+?)"?\s*<[^>]+>/);
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : first;
}

/**
 * Parse a raw date string from an email header into YYYY-MM-DD.
 * Handles formats like:
 *   "Tuesday, 26 April 2016 at 12:36:11 BST"  (Apple Mail / UK Gmail)
 *   "Monday, 5 May 2025 10:30 AM"              (Outlook)
 *   "Tue, 06 May 2025 09:00:00 +0000"          (RFC 2822)
 *   "6 May 2025"
 *   "05/06/2025"
 * Returns '' when the date cannot be parsed.
 */
const MONTH_INDEX = {
  jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
  jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
};

function toISODate(raw) {
  if (!raw) return '';
  let s = raw.trim();

  // Strip leading day-of-week, with or without a comma:
  //   "Tuesday, 26 April…"  "Mon, 5 May…"  "Thu 15 Jan…"
  s = s.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,\s]+/i, '');
  // Remove " at " between date and time ("26 April 2016 at 12:36")
  s = s.replace(/\s+at\s+/i, ' ');
  // Strip trailing timezone abbreviation or offset (BST, GMT, +0100, -0500 …)
  s = s.replace(/\s+(?:[A-Z]{2,5}|[+-]\d{4})$/, '').trim();

  // Try native Date first (handles ISO 8601, RFC 2822, "Month DD YYYY", etc.)
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  // Fallback: "DD Month YYYY" European layout ("26 April 2016 12:36:11")
  const mFull = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (mFull) {
    const month = MONTH_INDEX[mFull[2].toLowerCase().slice(0, 3)];
    if (month !== undefined) {
      d = new Date(parseInt(mFull[3]), month, parseInt(mFull[1]));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // Fallback: "DD Mon" or "DD Mon HH:MM" with no year (e.g. "15 Jan 13:41").
  // Assume current year; roll back one year if the result is in the future.
  const mShort = s.match(/^(\d{1,2})\s+([a-z]+)/i);
  if (mShort) {
    const month = MONTH_INDEX[mShort[2].toLowerCase().slice(0, 3)];
    if (month !== undefined) {
      const today = new Date();
      let year = today.getFullYear();
      d = new Date(year, month, parseInt(mShort[1]));
      if (d > today) d = new Date(year - 1, month, parseInt(mShort[1]));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  return '';
}
