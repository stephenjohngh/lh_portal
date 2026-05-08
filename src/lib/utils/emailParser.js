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

  // ── 1. Detection ──────────────────────────────────────────────────
  // Needs at least 2 recognisable header-style lines, OR a Gmail-style
  // "On [date] wrote:" separator.  This threshold avoids false positives on
  // prose that happens to contain "To:" or "Subject:".
  const headerCount = ['from:', 'to:', 'subject:', 'date:', 'sent:'].filter(
    h => new RegExp('^' + h, 'im').test(text)
  ).length;

  const hasGmailSep = /^on .{5,120}\bwrote:\s*$/im.test(text);

  if (headerCount < 2 && !hasGmailSep) return null;

  // ── 2. Isolate the latest message ─────────────────────────────────
  let workingText = text;
  let wasThread   = false;

  // Outlook threads: the second "From:" line at the start of a line signals
  // the beginning of the previous message in the chain.
  const fromMatches = [...text.matchAll(/^from:\s+.+/gim)];
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

  // ── 3. Parse header fields ────────────────────────────────────────
  const get = re => (re.exec(workingText)?.[1] ?? '').trim();

  const fromRaw  = get(/^from:\s+(.+)/im);
  const toRaw    = get(/^to:\s+(.+)/im);
  const subject  = get(/^subject:\s+(.+)/im);
  const dateRaw  = get(/^(?:date|sent):\s+(.+)/im);

  // ── 4. Extract body ───────────────────────────────────────────────
  // Headers form a contiguous block near the start; the body follows
  // the first blank line after the last header line.
  const workingLines = workingText.split('\n');
  const HEADER_LINE  = /^(?:from|to|cc|bcc|subject|date|sent|reply-to):\s+.+/i;

  let inHeaders    = false;
  let headerEndIdx = -1;

  for (let i = 0; i < Math.min(workingLines.length, 20); i++) {
    const trimmed = workingLines[i].trim();
    if (HEADER_LINE.test(trimmed)) {
      inHeaders    = true;
      headerEndIdx = i;
    } else if (inHeaders) {
      // Blank line after headers = end of header block
      if (trimmed === '') {
        headerEndIdx = i;
        break;
      }
      // Non-blank, non-header line while in headers = end (no blank separator)
      break;
    } else if (trimmed !== '') {
      // Non-blank line before any headers → headers are absent or come later
      break;
    }
  }

  let body = '';

  if (headerEndIdx >= 0) {
    body = workingLines.slice(headerEndIdx + 1).join('\n').trim();

    // Outlook sometimes puts the reply body BEFORE the header block.
    // If the parsed body is empty, use whatever came before the headers instead.
    if (!body) {
      body = workingLines.slice(0, Math.max(0, headerEndIdx - 3)).join('\n').trim();
    }
  } else {
    // No header block found — treat entire working text as body and strip
    // quoted lines (lines starting with ">").
    body = workingLines.filter(l => !l.startsWith('>')).join('\n').trim();
  }

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

  // Strip leading day-of-week ("Tuesday, " etc.)
  s = s.replace(/^[a-z]+,\s*/i, '');
  // Remove " at " between date and time ("26 April 2016 at 12:36")
  s = s.replace(/\s+at\s+/i, ' ');
  // Strip trailing timezone abbreviation or offset (BST, GMT, +0100, -0500 …)
  s = s.replace(/\s+(?:[A-Z]{2,5}|[+-]\d{4})$/, '').trim();

  // Try native Date first (handles ISO 8601, RFC 2822, "Month DD YYYY", etc.)
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  // Fallback: "DD Month YYYY" European layout ("26 April 2016 12:36:11")
  const m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (m) {
    const month = MONTH_INDEX[m[2].toLowerCase().slice(0, 3)];
    if (month !== undefined) {
      d = new Date(parseInt(m[3]), month, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  return '';
}
