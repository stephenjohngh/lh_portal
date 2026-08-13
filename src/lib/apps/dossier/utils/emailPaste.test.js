// src/lib/apps/dossier/utils/emailPaste.test.js
// P2 step 3 — pasting an email thread into the correspondence table.
//
// The risk here is not the header parsing (emailParser owns and tests that);
// it is the SPLIT. Getting the boundaries wrong either merges four messages
// into one row or invents empty ones, and both are silent.

import { describe, it, expect } from 'vitest';
import {
  splitEmailThread, emailToCorrespondence, parsePastedEmails, describePasteResult,
} from './emailPaste.js';

const OUTLOOK_THREAD = `From: Jane Patel <jane@lawfirm.co.uk>
Sent: Tuesday, 14 January 2025 09:12
To: Stephen Hall <stephen@example.com>
Subject: RE: Section 20 consultation

Thanks — noted. We will respond by Friday.

From: Stephen Hall <stephen@example.com>
Sent: Monday, 13 January 2025 16:40
To: Jane Patel <jane@lawfirm.co.uk>
Subject: Section 20 consultation

Please find the notice attached. The consultation period opens today.
`;

const GMAIL_THREAD = `Yes, that works for us.

On Tue, 14 Jan 2025 at 09:12, Jane Patel <jane@lawfirm.co.uk> wrote:

From: Jane Patel <jane@lawfirm.co.uk>
To: Stephen Hall <stephen@example.com>
Subject: Meeting on site
Date: 14 January 2025

Could we meet on site on Thursday morning?
`;

const SINGLE = `From: Jane Patel <jane@lawfirm.co.uk>
Sent: 14 January 2025 09:12
To: Stephen Hall <stephen@example.com>
Subject: Section 20 consultation

The notice is attached.
`;

describe('splitEmailThread', () => {
  it('splits an Outlook thread on each subsequent From: line', () => {
    const parts = splitEmailThread(OUTLOOK_THREAD);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('RE: Section 20 consultation');
    expect(parts[1]).toContain('Please find the notice attached');
  });

  it('does not split the first message on its own From: line', () => {
    expect(splitEmailThread(SINGLE)).toHaveLength(1);
  });

  it('splits on a Gmail "wrote:" marker', () => {
    const parts = splitEmailThread(GMAIL_THREAD);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toContain('Yes, that works for us');
  });

  it('splits on an Outlook forwarded-message rule', () => {
    const text = 'Top reply.\n\n-----Original Message-----\nFrom: A\nSubject: X\n\nBody.';
    expect(splitEmailThread(text)).toHaveLength(2);
  });

  it('strips quote markers so quoted separators still match', () => {
    const quoted = OUTLOOK_THREAD.split('\n').map(l => `> ${l}`).join('\n');
    expect(splitEmailThread(quoted)).toHaveLength(2);
  });

  it('returns one segment for plain text with no separators', () => {
    expect(splitEmailThread('Just a note about the roof.')).toHaveLength(1);
  });

  it('returns nothing for empty input', () => {
    expect(splitEmailThread('')).toEqual([]);
    expect(splitEmailThread('   \n  ')).toEqual([]);
  });
});

describe('emailToCorrespondence', () => {
  it('maps the parser output onto the template fields', () => {
    const fields = emailToCorrespondence({
      from: 'Jane Patel', to: 'Stephen Hall', subject: 'Roof works',
      email_date: '2025-01-14', body: 'Please confirm.',
    });
    expect(fields).toEqual({
      date: '2025-01-14', from: 'Jane Patel', to: 'Stephen Hall',
      // The subject fills the one column a reader scans; the message goes to
      // `body`, which renders on a line of its own.
      subject: 'Roof works', body: 'Please confirm.',
    });
  });

  it('keeps every column the template defines, even when empty', () => {
    expect(Object.keys(emailToCorrespondence({})).sort())
      .toEqual(['body', 'date', 'from', 'subject', 'to']);
  });

  it('drops a date the template cannot store rather than storing junk', () => {
    expect(emailToCorrespondence({ email_date: 'last Tuesday' }).date).toBe('');
  });

  it('keeps the whole body — a summary is edited down, not truncated for you', () => {
    const long = 'x'.repeat(2000);
    expect(emailToCorrespondence({ body: long }).body).toHaveLength(2000);
  });

  it('collapses runs of blank lines', () => {
    expect(emailToCorrespondence({ body: 'One.\n\n\n\nTwo.' }).body).toBe('One.\n\nTwo.');
  });
});

describe('parsePastedEmails', () => {
  it('returns one row per message, oldest first', () => {
    const { rows } = parsePastedEmails(OUTLOOK_THREAD);

    expect(rows).toHaveLength(2);
    // A thread is pasted newest-first; a correspondence table reads forwards.
    expect(rows[0].subject).toBe('Section 20 consultation');
    expect(rows[1].subject).toBe('RE: Section 20 consultation');
    expect(rows[0].date).toBe('2025-01-13');
    expect(rows[1].date).toBe('2025-01-14');
  });

  it('extracts display names, not raw addresses', () => {
    const { rows } = parsePastedEmails(SINGLE);
    expect(rows[0].from).toBe('Jane Patel');
    expect(rows[0].to).toBe('Stephen Hall');
  });

  it('keeps the body as the message', () => {
    const { rows } = parsePastedEmails(SINGLE);
    expect(rows[0].body).toContain('The notice is attached');
    // Header lines must not leak into the message.
    expect(rows[0].body).not.toContain('Subject:');
  });

  it('reports unreadable segments instead of dropping them silently', () => {
    const text = `${SINGLE}\n-----Original Message-----\nnot an email at all`;
    const result = parsePastedEmails(text);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(2);
  });

  it('collapses a message the thread repeats', () => {
    const doubled = `${OUTLOOK_THREAD}\n${OUTLOOK_THREAD}`;
    const { rows } = parsePastedEmails(doubled);
    expect(rows).toHaveLength(2);
  });

  it('returns nothing for prose that only mentions an email', () => {
    const { rows, skipped } = parsePastedEmails(
      'I emailed the agent to ask about the roof and they have not replied.');
    expect(rows).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('returns nothing for empty input, and reports no failures', () => {
    expect(parsePastedEmails('')).toEqual({ rows: [], skipped: 0, total: 0 });
  });
});

describe('describePasteResult', () => {
  it('counts what was found', () => {
    expect(describePasteResult({ rows: [{}, {}] })).toBe('2 messages');
    expect(describePasteResult({ rows: [{}] })).toBe('1 message');
  });

  it('says what was left out', () => {
    expect(describePasteResult({ rows: [{}], skipped: 2 }))
      .toContain('2 parts could not be read');
  });

  it('distinguishes "nothing pasted" from "nothing recognised"', () => {
    // Two different failures needing two different actions from the author.
    expect(describePasteResult({})).toContain('paste an email');
    expect(describePasteResult({ skipped: 1 })).toContain('From/To/Subject');
  });
});
