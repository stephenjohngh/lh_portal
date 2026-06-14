// src/lib/utils/emailParser.test.js
// parseEmailPaste detects pasted email content, isolates the latest message in a
// thread, and extracts From/To/Subject/Date/body. Returns null for non-email text.

import { describe, it, expect } from 'vitest';
import { parseEmailPaste } from './emailParser.js';

describe('parseEmailPaste — detection', () => {
  it('returns null for short or non-email text', () => {
    expect(parseEmailPaste('hi')).toBeNull();
    expect(parseEmailPaste('Just a normal sentence with no headers at all here.')).toBeNull();
  });

  it('needs at least two header lines (one is not enough)', () => {
    expect(parseEmailPaste('To: someone@example.com\njust a body line here padding it out')).toBeNull();
  });
});

describe('parseEmailPaste — Outlook-style headers', () => {
  it('extracts the header fields and body', () => {
    const text = [
      'From: John Doe <john@example.com>',
      'Sent: Monday, 5 May 2025 10:30 AM',
      'To: Jane Roe <jane@example.com>',
      'Subject: Roof leak',
      '',
      'The roof is leaking again near unit 4.',
    ].join('\n');
    const r = parseEmailPaste(text);
    expect(r).not.toBeNull();
    expect(r.from).toBe('John Doe');               // display name extracted from <…>
    expect(r.to).toBe('Jane Roe');
    expect(r.subject).toBe('Roof leak');
    expect(r.email_date).toBe('2025-05-05');       // normalised to ISO
    expect(r.body).toContain('roof is leaking');
  });

  it('isolates the latest message when two From: blocks are present', () => {
    const text = [
      'From: New Person <new@example.com>',
      'Subject: Re: Roof leak',
      '',
      'Confirmed, sending someone today.',
      '',
      'From: Old Person <old@example.com>',
      'Subject: Roof leak',
      '',
      'Original message body.',
    ].join('\n');
    const r = parseEmailPaste(text);
    expect(r.wasThread).toBe(true);
    expect(r.from).toBe('New Person');
    expect(r.body).toContain('sending someone today');
    expect(r.body).not.toContain('Original message body');
  });
});

describe('parseEmailPaste — Gmail-style separator', () => {
  it('detects the "On … wrote:" marker and keeps the top reply', () => {
    const text = [
      'Thanks, that works for me and I appreciate the quick turnaround here.',
      '',
      'On Mon, 5 May 2025 at 09:00, John Doe <john@example.com> wrote:',
      'Can we meet on Tuesday?',
    ].join('\n');
    const r = parseEmailPaste(text);
    expect(r).not.toBeNull();
    expect(r.wasThread).toBe(true);
    expect(r.body).toContain('that works for me');
    expect(r.body).not.toContain('meet on Tuesday');
  });
});
