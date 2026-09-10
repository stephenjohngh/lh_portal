// src/lib/server/complianceDocx.test.js
//
// Document generation fails at runtime on things static analysis cannot see: a
// null in a cell, a bad enum, column widths that do not sum to the page. Before
// these tests existed the report route had never once executed — the whole
// point of moving the builders out of `+server.js` (which may only export HTTP
// verbs) was to let them be exercised here.
//
// These PACK A REAL DOCUMENT. If docx rejects anything, Packer throws.

import { describe, it, expect } from 'vitest';
import {
  buildComplianceDocument, printedRows, d,
  POSITION_COLS, HISTORY_COLS, EXCLUSION_COLS, CONTENT_W_L, Packer,
} from './complianceDocx.js';

const sum = a => a.reduce((x, y) => x + y, 0);

// Rows in the shape ComplianceTab actually posts.
const row = (over = {}) => ({
  name: 'Gas safety check',
  basis: 'statute',
  group: 'other_statutory',
  statutoryRef: 'Gas Safety (Installation and Use) Regulations 1998, reg 36(3)',
  owner: 'Gas Safe registered engineer',
  frequencyLabel: 'Annual',
  lastCompleted: '2026-03-01T00:00:00Z',
  lastAttempted: '2026-03-01T00:00:00Z',
  lastOutcome: 'Completed — pass',
  nextDue: '2027-03-01T00:00:00Z',
  status: 'ok',
  statusLabel: 'On schedule',
  handledBy: 'Maintenance',
  intervalBreached: false,
  exclusionReason: null,
  exclusionDecidedAt: null,
  exclusionReviewDue: null,
  ...over,
});

const payload = (over = {}) => ({
  building: 'Lonsdale House',
  generatedAt: '10 Sep 2026',
  rows: [row()],
  history: [],
  historyWindow: { from: '2025-09-10', to: '2026-09-10', mode: 'completed' },
  summary: { ok: 1 },
  options: {},
  ...over,
});

const packs = async input => {
  const buf = await Packer.toBuffer(buildComplianceDocument(input));
  // A .docx is a zip — "PK" is its magic number. Anything shorter is not a file.
  expect(buf.length).toBeGreaterThan(2000);
  expect(buf[0]).toBe(0x50);
  expect(buf[1]).toBe(0x4b);
  return buf;
};

// A width array that does not sum to the content width makes Word silently
// reflow the table, which is invisible until someone opens the document.
describe('column widths', () => {
  it('every table spans exactly the landscape content width', () => {
    expect(sum(POSITION_COLS)).toBe(CONTENT_W_L);
    expect(sum(HISTORY_COLS)).toBe(CONTENT_W_L);
    expect(sum(EXCLUSION_COLS)).toBe(CONTENT_W_L);
  });

  it('has one width per column of each header', () => {
    expect(POSITION_COLS).toHaveLength(7);
    expect(HISTORY_COLS).toHaveLength(5);
    expect(EXCLUSION_COLS).toHaveLength(4);
  });
});

describe('dates', () => {
  it('formats en-GB and never guesses at junk', () => {
    expect(d('2026-03-01T00:00:00Z')).toBe('01 Mar 2026');
    expect(d(null)).toBe('—');
    expect(d('')).toBe('—');
    expect(d('not a date')).toBe('—');
  });
});

describe('printedRows — options narrow, never add', () => {
  const rows = [
    row({ name: 'A', status: 'ok' }),
    row({ name: 'B', status: 'excluded' }),
    row({ name: 'C', status: 'elsewhere' }),
  ];

  it('includes everything by default', () => {
    expect(printedRows(rows, {})).toHaveLength(3);
    expect(printedRows(rows)).toHaveLength(3);
  });

  it('drops only what was switched off', () => {
    expect(printedRows(rows, { includeExcluded: false }).map(r => r.name)).toEqual(['A', 'C']);
    expect(printedRows(rows, { includeElsewhere: false }).map(r => r.name)).toEqual(['A', 'B']);
  });

  it('can never return more rows than it was given', () => {
    expect(printedRows(rows, { includeExcluded: true, includeElsewhere: true }).length)
      .toBeLessThanOrEqual(rows.length);
    expect(printedRows(null, {})).toEqual([]);
  });
});

describe('building the document', () => {
  it('packs a real .docx from an ordinary payload', async () => {
    await packs(payload());
  });

  // Every one of these was a plausible 500 before the builders were testable.
  it('survives an empty report', async () => {
    await packs(payload({ rows: [], summary: {}, history: [] }));
  });

  it('survives rows with nothing recorded on them', async () => {
    await packs(payload({
      rows: [{ name: 'Bare requirement', status: 'gap' }],
      summary: { gap: 1 },
    }));
  });

  it('survives a completely empty payload', async () => {
    await packs(undefined);
    await packs({});
  });

  it('handles a never-completed row, which prints "Never" rather than blank', async () => {
    await packs(payload({
      rows: [row({ lastCompleted: null, lastAttempted: null, lastOutcome: null, status: 'breach', statusLabel: 'In breach' })],
      summary: { breach: 1 },
    }));
  });

  it('handles an interval breach, which appends to the status cell', async () => {
    await packs(payload({ rows: [row({ intervalBreached: true })] }));
  });

  it('handles an unknown group and an unknown basis without dropping the row', async () => {
    await packs(payload({ rows: [row({ group: 'invented', basis: 'invented' })] }));
  });

  it('renders the exclusions section, with and without a review date', async () => {
    await packs(payload({
      rows: [
        row({ name: 'Lift maintenance', status: 'excluded', statusLabel: 'Recorded as not applicable',
              exclusionReason: 'No lift — four storeys', exclusionDecidedAt: '2026-01-01T00:00:00Z' }),
        row({ name: 'EICR — rented dwellings', status: 'excluded', statusLabel: 'Recorded as not applicable',
              exclusionReason: 'All long leases', exclusionDecidedAt: '2026-01-01T00:00:00Z',
              exclusionReviewDue: '2027-04-01' }),
      ],
      summary: { excluded: 2 },
    }));
  });

  it('renders the history section in both modes', async () => {
    const history = [{
      at: '2026-07-17T12:00:00Z', kind: 'walk', status: 'attempted',
      obligationName: 'Emergency Lighting', statutoryRef: 'BS 5266-1',
      outcome: 'Partial — 3 of 14 observed', by: null, reference: null, notes: null,
    }];
    await packs(payload({ history, options: { includeHistory: true } }));
    await packs(payload({
      history, options: { includeHistory: true },
      historyWindow: { from: '2026-09-10', to: '2027-09-10', mode: 'due' },
    }));
  });

  it('renders the note and the degraded-evidence warning', async () => {
    await packs(payload({
      options: {
        notes: 'Position as presented to the 14 October board meeting.',
        walkEvidenceNote: 'You do not have the Inspection app, so walk evidence is not included.',
      },
    }));
  });

  // The real five obligations and three closed walks on the live database, as
  // the screen would post them. If the tutorial's §14 works, this is why.
  it('packs the live building’s actual position', async () => {
    await packs(payload({
      rows: [
        row({ name: 'Emergency Lighting', basis: null, group: 'unlisted', statutoryRef: null,
              frequencyLabel: 'Monthly', lastCompleted: null,
              lastAttempted: '2026-07-17T12:00:00Z', lastOutcome: 'Partial — 3 of 14 observed',
              nextDue: null, status: 'breach', statusLabel: 'In breach' }),
        row({ name: 'Wayfinding Sign Check', basis: null, group: 'unlisted', statutoryRef: null,
              frequencyLabel: 'Annual', lastCompleted: '2026-07-19T12:00:00Z',
              lastAttempted: '2026-07-19T12:00:00Z', lastOutcome: 'Completed — all 4 in scope',
              nextDue: '2027-07-19T12:00:00Z', status: 'ok', statusLabel: 'On schedule' }),
        row({ name: 'Every Component', basis: null, group: 'unlisted', statutoryRef: null,
              frequencyLabel: 'On demand', lastCompleted: null, lastAttempted: null,
              lastOutcome: null, nextDue: null, status: 'ok', statusLabel: 'On schedule' }),
      ],
      summary: { breach: 3, gap: 62, ok: 2, elsewhere: 9, unhomed: 6 },
    }));
  });
});
