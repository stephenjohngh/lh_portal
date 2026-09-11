// src/lib/apps/maintenance/utils/maintenanceHelpers.test.js
//
// Pins the pure RAG / expiry / label / date logic — the boundary-heavy bits the
// diary + documents views depend on. The clock is frozen to local noon on
// 2026-06-15 so "today", the 30-day due-soon window and the 60-day expiry window
// land on exact dates. Dates are constructed in LOCAL time (no trailing Z) to
// match the helpers, which parse `${dateStr}T00:00:00` as local.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  jobRag, ragConfig, resultConfig, frequencyLabel, scopeTypeLabel,
  docTypeLabel, docTypeIcon, daysRelative, expiryRag, fmtBytes,
  expiringCertificates, certificateExpirySummary,
} from './maintenanceHelpers.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 2026-06-15 12:00 local
});
afterEach(() => vi.useRealTimers());

const job = (over) => ({ status: 'scheduled', scheduled_date: '2026-06-15', ...over });

describe('jobRag', () => {
  it('short-circuits on non-scheduled statuses', () => {
    expect(jobRag(job({ status: 'completed' }))).toBe('completed');
    expect(jobRag(job({ status: 'cancelled' }))).toBe('cancelled');
    expect(jobRag(job({ status: 'in_progress' }))).toBe('in_progress');
  });

  it('is overdue when the due date is before today', () => {
    expect(jobRag(job({ scheduled_date: '2026-06-14' }))).toBe('overdue');
  });

  it('is due_soon from today through exactly today+30', () => {
    expect(jobRag(job({ scheduled_date: '2026-06-15' }))).toBe('due_soon'); // today
    expect(jobRag(job({ scheduled_date: '2026-07-15' }))).toBe('due_soon'); // today+30 (boundary)
  });

  it('is scheduled beyond today+30', () => {
    expect(jobRag(job({ scheduled_date: '2026-07-16' }))).toBe('scheduled');
  });

  it('uses hard_expiry_date when it is EARLIER than scheduled_date', () => {
    // scheduled far off, but a hard regulatory deadline already passed → overdue
    expect(jobRag(job({ scheduled_date: '2026-12-01', hard_expiry_date: '2026-06-10' }))).toBe('overdue');
    // hard deadline within 30 days but scheduled later → due_soon
    expect(jobRag(job({ scheduled_date: '2026-12-01', hard_expiry_date: '2026-07-01' }))).toBe('due_soon');
  });

  it('ignores hard_expiry_date when it is LATER than scheduled_date', () => {
    // scheduled is the earlier (and overdue) one; a later hard date must not rescue it
    expect(jobRag(job({ scheduled_date: '2026-06-14', hard_expiry_date: '2027-01-01' }))).toBe('overdue');
  });
});

describe('ragConfig / resultConfig', () => {
  it('returns a config per RAG state and falls back to scheduled', () => {
    expect(ragConfig('overdue').label).toBe('Overdue');
    expect(ragConfig('due_soon').label).toBe('Due Soon');
    expect(ragConfig('completed').label).toBe('Completed');
    expect(ragConfig('nonsense').label).toBe('Scheduled'); // fallback
  });
  it('returns a config per result, null for unknown', () => {
    expect(resultConfig('pass').label).toBe('Pass');
    expect(resultConfig('fail').label).toBe('Fail');
    expect(resultConfig('n_a').label).toBe('N/A');
    expect(resultConfig(undefined)).toBeNull();
  });
});

describe('frequencyLabel', () => {
  it('maps known day counts (incl. the 31/182/183/366 near-values)', () => {
    expect(frequencyLabel(30)).toBe('Monthly');
    expect(frequencyLabel(31)).toBe('Monthly');
    expect(frequencyLabel(90)).toBe('Quarterly');
    expect(frequencyLabel(180)).toBe('6-Monthly');
    expect(frequencyLabel(183)).toBe('6-Monthly');
    expect(frequencyLabel(365)).toBe('Annual');
    expect(frequencyLabel(366)).toBe('Annual');
    expect(frequencyLabel(730)).toBe('2-Yearly');
    expect(frequencyLabel(1825)).toBe('5-Yearly');
  });
  it('falls back to "Every N days"', () => {
    expect(frequencyLabel(45)).toBe('Every 45 days');
  });
});

describe('scope / doc labels', () => {
  it('scopeTypeLabel maps + echoes unknown', () => {
    expect(scopeTypeLabel('building')).toBe('Building');
    expect(scopeTypeLabel('component')).toBe('Component');
    expect(scopeTypeLabel('weird')).toBe('weird');
  });
  it('docTypeLabel + docTypeIcon map + fall back', () => {
    expect(docTypeLabel('certificate')).toBe('Certificate');
    expect(docTypeLabel('mystery')).toBe('mystery');
    expect(docTypeIcon('certificate')).toBe('🏅');
    expect(docTypeIcon('mystery')).toBe('📎'); // fallback
  });
});

describe('daysRelative', () => {
  it('reports today / tomorrow / future / overdue with singular/plural', () => {
    expect(daysRelative('2026-06-15')).toBe('Due today');
    expect(daysRelative('2026-06-16')).toBe('Due tomorrow');
    expect(daysRelative('2026-06-20')).toBe('Due in 5 days');
    expect(daysRelative('2026-06-14')).toBe('1 day overdue');
    expect(daysRelative('2026-06-10')).toBe('5 days overdue');
  });
});

describe('expiryRag', () => {
  it('returns null when there is no date', () => {
    expect(expiryRag(null)).toBeNull();
    expect(expiryRag('')).toBeNull();
  });
  it('classifies expired / expiring (default 60d) / valid, on the boundaries', () => {
    expect(expiryRag('2026-06-14')).toBe('expired');
    expect(expiryRag('2026-06-15')).toBe('expiring'); // today counts as expiring
    expect(expiryRag('2026-08-14')).toBe('expiring'); // today+60 (boundary)
    expect(expiryRag('2026-08-15')).toBe('valid');
  });
  it('honours a custom warning window', () => {
    expect(expiryRag('2026-09-01', 120)).toBe('expiring'); // within today+120
    expect(expiryRag('2026-09-01', 30)).toBe('valid');     // outside today+30
  });
});

describe('fmtBytes', () => {
  it('formats B / KB / MB and blanks 0/undefined', () => {
    expect(fmtBytes(0)).toBe('');
    expect(fmtBytes(undefined)).toBe('');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

// M5 · certificate expiry was recorded, badged on one tab, and fed nothing.
// The clock is frozen at 2026-06-15 by the harness above.
describe('expiringCertificates', () => {
  const docs = [
    { id: 'gone',    expiry_date: '2026-01-01' },  // expired months ago
    { id: 'lapsed',  expiry_date: '2026-06-14' },  // expired yesterday
    { id: 'soon',    expiry_date: '2026-06-20' },  // within 60 days
    { id: 'edge',    expiry_date: '2026-08-14' },  // today + 60, the boundary
    { id: 'fine',    expiry_date: '2026-12-01' },  // beyond the horizon
    { id: 'undated', expiry_date: null },          // no expiry recorded
  ];

  it('returns only what is expired or expiring, soonest first', () => {
    expect(expiringCertificates(docs).map(d => d.id))
      .toEqual(['gone', 'lapsed', 'soon', 'edge']);
  });

  it('tags each with its state', () => {
    const byId = new Map(expiringCertificates(docs).map(d => [d.id, d.expiryState]));
    expect(byId.get('gone')).toBe('expired');
    expect(byId.get('lapsed')).toBe('expired');
    expect(byId.get('soon')).toBe('expiring');
  });

  it('ignores documents with no expiry date rather than treating them as expired', () => {
    expect(expiringCertificates(docs).some(d => d.id === 'undated')).toBe(false);
  });

  it('honours a narrower warning window', () => {
    expect(expiringCertificates(docs, { warningDays: 7 }).map(d => d.id))
      .toEqual(['gone', 'lapsed', 'soon']);
  });

  it('does not mutate the documents it is given', () => {
    const input = [{ id: 'a', expiry_date: '2026-06-20' }];
    expiringCertificates(input);
    expect(input[0]).not.toHaveProperty('expiryState');
  });

  it('survives no documents at all', () => {
    expect(expiringCertificates([])).toEqual([]);
    expect(expiringCertificates(null)).toEqual([]);
    expect(expiringCertificates(undefined)).toEqual([]);
  });
});

describe('certificateExpirySummary', () => {
  it('separates expired from expiring', () => {
    const s = certificateExpirySummary([
      { id: 'a', expiry_date: '2026-01-01' },
      { id: 'b', expiry_date: '2026-06-20' },
      { id: 'c', expiry_date: '2026-12-01' },
    ]);
    expect(s).toMatchObject({ expired: 1, expiring: 1, attention: 2, tracked: 3 });
  });

  // The whole reason this returns `tracked` rather than just a number: a
  // building with no expiry dates recorded must not read like a clean one.
  it('distinguishes "nothing expiring" from "nothing tracked"', () => {
    const nothingTracked = certificateExpirySummary([{ id: 'a', expiry_date: null }]);
    expect(nothingTracked).toMatchObject({ tracked: 0, attention: 0 });

    const allHealthy = certificateExpirySummary([{ id: 'a', expiry_date: '2027-01-01' }]);
    expect(allHealthy).toMatchObject({ tracked: 1, attention: 0 });

    // Same attention count, and they must not be presented the same way.
    expect(nothingTracked.attention).toBe(allHealthy.attention);
    expect(nothingTracked.tracked).not.toBe(allHealthy.tracked);
  });

  it('carries the flagged list so a caller need not ask twice', () => {
    const s = certificateExpirySummary([{ id: 'a', expiry_date: '2026-01-01' }]);
    expect(s.flagged.map(d => d.id)).toEqual(['a']);
  });
});
