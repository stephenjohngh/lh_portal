import { describe, it, expect } from 'vitest';
import { summariseAccess, describeAccess, EVENT_LABEL } from './publicationAccess.js';

const ev = (publication_id, event, created_at, ip = '1.1.1.1') => ({ publication_id, event, ip, created_at });

describe('summariseAccess', () => {
  it('gives every asked-about link an entry, even with no events', () => {
    const s = summariseAccess(['a', 'b'], [ev('a', 'opened', '2026-11-01T10:00:00Z')]);
    expect(s.b.opens).toBe(0);
    expect(describeAccess(s.b)).toBe('Not opened yet');
  });

  it('keeps two links of one pack apart', () => {
    const s = summariseAccess(['a', 'b'], [
      ev('a', 'opened', '2026-11-01T10:00:00Z'),
      ev('b', 'opened', '2026-11-02T10:00:00Z'),
      ev('b', 'opened', '2026-11-03T10:00:00Z', '2.2.2.2'),
    ]);
    expect(s.a.opens).toBe(1);
    expect(s.b.opens).toBe(2);
    expect(s.b.addresses).toBe(2);
    expect(s.b.lastOpen).toBe('2026-11-03T10:00:00Z');
    expect(s.b.firstOpen).toBe('2026-11-02T10:00:00Z');
  });

  it('counts files, wrong passphrases and attempts after the link stopped working separately from opens', () => {
    const s = summariseAccess(['a'], [
      ev('a', 'opened', '2026-11-01T10:00:00Z'),
      ev('a', 'file', '2026-11-01T10:01:00Z'),
      ev('a', 'unlock_failed', '2026-11-01T09:59:00Z'),
      ev('a', 'refused_revoked', '2026-11-05T10:00:00Z'),
      ev('a', 'refused_expired', '2026-11-06T10:00:00Z'),
    ]);
    expect(s.a).toMatchObject({ opens: 1, files: 1, failedUnlocks: 1, refused: 2 });
  });

  it('describes opens with the number of addresses', () => {
    const s = summariseAccess(['a'], [ev('a', 'opened', '2026-11-01T10:00:00Z'), ev('a', 'opened', '2026-11-02T10:00:00Z')]);
    expect(describeAccess(s.a, (v) => `<${v}>`)).toBe('Opened 2 times from 1 address, last <2026-11-02T10:00:00Z>');
  });

  it('has a label for every event the table allows', () => {
    for (const e of ['opened', 'unlock_ok', 'unlock_failed', 'file', 'refused_revoked', 'refused_expired']) {
      expect(EVENT_LABEL[e]).toBeTruthy();
    }
  });
});
