// src/lib/server/statementSection6.test.js
//
// §6 of the obligations statement, rendered from the register. R4.
//
// ⚠ THESE READ THE REAL REGISTER, not fixtures. A fixture that transcribes
// register data is what broke tests four rounds running here: a legal
// correction to a citation would fail a test that was only ever asserting the
// old citation. So every assertion below is an invariant that must hold
// whatever the 116 entries happen to say.
//
// ⛔ Byte-for-byte reproduction of the CURRENT document is asserted by
// `npm run check:statement-render`, not here — it needs the statement, which is
// in gitignored `docs/` and does not ship. What is here is everything that can
// be asserted from the register alone.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import {
  renderEntry, renderSection6, buildStatementSection6,
  intervalLabel, intervalSourceLabel, retentionLabel,
} from './statementSection6.js';

const LIVE = STATUTORY_TEMPLATE.filter(e => !e.supersededOn);
const section = renderSection6(STATUTORY_TEMPLATE);

describe('renderSection6 — every applicable row reaches the page', () => {
  // ⛔ The reason this test exists, and it is not hypothetical. The statement
  // once grouped on `building_own` while the data said `building_specific`.
  // Nothing errored and NINE ENTRIES were absent from every version of the
  // document ever produced, including the copy a reviewer assessed.
  it('prints a heading for every entry in the register', () => {
    const names = [...section.matchAll(/^#### (.+)$/gm)].map(m => m[1]);
    expect(names).toHaveLength(LIVE.length);
    expect(new Set(names)).toEqual(new Set(LIVE.map(e => e.name)));
  });

  it('throws rather than dropping an entry whose group it does not print', () => {
    const rogue = { ...LIVE[0], key: 'rogue', group: 'building_own' };
    expect(() => renderSection6([...STATUTORY_TEMPLATE, rogue]))
      .toThrow(/no printed group/);
  });

  it('names the offending entry and its group, so the fault is actionable', () => {
    const rogue = { ...LIVE[0], key: 'rogue_key', group: 'nowhere' };
    expect(() => renderSection6([...STATUTORY_TEMPLATE, rogue]))
      .toThrow(/rogue_key \(group "nowhere"\)/);
  });

  it('counts in the headings equal the rows beneath them', () => {
    const total = Number(section.match(/^## 6\. The register \((\d+)\)$/m)[1]);
    expect(total).toBe(LIVE.length);

    const groups = [...section.matchAll(/^### (.+) \((\d+)\)$/gm)];
    expect(groups.length).toBeGreaterThan(0);
    const summed = groups.reduce((n, m) => n + Number(m[2]), 0);
    expect(summed).toBe(LIVE.length);
  });

  it('leaves superseded entries out, and out of the count', () => {
    const withdrawn = { ...LIVE[0], key: 'gone', name: 'A withdrawn duty', supersededOn: '2026-01-01' };
    const out = renderSection6([...STATUTORY_TEMPLATE, withdrawn]);
    expect(out).not.toContain('A withdrawn duty');
    expect(out).toMatch(new RegExp(`^## 6\\. The register \\(${LIVE.length}\\)$`, 'm'));
  });

  it('uses the document’s group wording, not the app’s', () => {
    // Two of the five differ, and both differences were settled in review.
    expect(section).toContain('### Building Safety Act duties, triggers and assurance controls');
    expect(section).not.toContain('### Building Safety Act cycles');
    expect(section).toContain('### Governance and assurance');
    expect(section).not.toContain('### Governance and review');
  });
});

describe('renderEntry — invariants over all 116', () => {
  it('gives every entry a heading, a description and a reference', () => {
    for (const e of LIVE) {
      const md = renderEntry(e);
      expect(md.startsWith(`#### ${e.name}\n`), e.key).toBe(true);
      expect(md, e.key).toContain('| **Reference** |');
    }
  });

  it('never renders a raw field name or an undefined into a cell', () => {
    for (const e of LIVE) {
      const md = renderEntry(e);
      expect(md, e.key).not.toMatch(/\|\s*(undefined|null|\[object Object\])\s*\|/);
    }
  });

  // ⛔ Round 9 and round 14, as a rule rather than a sentence. No instrument
  // anywhere states 366 days, or 92, or 183 — those are our arithmetic on a
  // calendar word, and this document exists to stop conventions being read as
  // law. Printing one under a statutory heading is that error turned inwards.
  it('never prints a day figure under a heading claiming it is the legal limit', () => {
    expect(section).not.toContain('| **Maximum permitted interval** |');
    for (const e of LIVE.filter(x => x.maxIsSchedulingTolerance)) {
      const md = renderEntry(e);
      expect(md, e.key).toContain('| **Our scheduling tolerance** |');
      expect(md, e.key).not.toContain('| **Internal scheduling ceiling** |');
    }
  });

  it('quotes the source’s own period wherever the row records one', () => {
    for (const e of LIVE.filter(x => x.sourceIntervalWords && x.maxIntervalDays)) {
      const md = renderEntry(e);
      const heading = e.basis === 'statute' ? 'Statutory interval' : 'Interval specified by the reference';
      expect(md, e.key).toContain(`| **${heading}** |`);
    }
  });

  // ⛔ b4a5fec, in the document rather than the report: completing an annual
  // confirmation says only that the confirmation happened.
  it('says on every assurance-only row that it does not discharge the duty', () => {
    const rows = LIVE.filter(e => e.assuranceOnly);
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      const md = renderEntry(e);
      expect(md, e.key).toContain('| **⚠ Does NOT discharge** |');
      expect(md, e.key).toContain('Calendar — assurance control only');
      expect(md, e.key).toContain(e.assuranceOnly);
    }
  });

  // ⛔ Round 6: "the warning itself can become permanent". An unassigned action
  // is conspicuous on every reading; a paragraph is not.
  it('prints a completion action on every operationally incomplete row', () => {
    const rows = LIVE.filter(e => e.operationallyIncomplete);
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(renderEntry(e), e.key).toContain('| **Completion action** |');
    }
    for (const e of LIVE.filter(x => !x.operationallyIncomplete)) {
      expect(renderEntry(e), e.key).not.toContain('| **Completion action** |');
    }
  });

  // ⚠ "Declare, don't scrape". Scraping `handlingNote` once leaked "no home in
  // the portal" into a document written for an outsider.
  it('prints no internal field but reviewerNote', () => {
    for (const e of LIVE) {
      const md = renderEntry(e);
      if (e.handlingNote) expect(md, e.key).not.toContain(e.handlingNote);
      if (e.scopeNote) expect(md, e.key).not.toContain(e.scopeNote);
    }
  });
});

describe('provenance — shown only when there is something to show', () => {
  const e = LIVE[0];

  it('says nothing for an unmodified seeded row', () => {
    const plain = renderEntry(e);
    expect(renderEntry(e, undefined)).toBe(plain);
    expect(renderEntry(e, { origin: 'seed', seedModifiedAt: null })).toBe(plain);
  });

  it('marks a locally added row as not part of the standard register', () => {
    const md = renderEntry(e, { origin: 'local' });
    expect(md).toContain('| **Provenance** |');
    expect(md).toContain('ADDED HERE');
  });

  it('marks a seeded row that has been edited here', () => {
    const md = renderEntry(e, { origin: 'seed', seedModifiedAt: '2026-09-19T10:00:00Z' });
    expect(md).toContain('EDITED HERE');
  });

  it('treats a local row as added rather than edited, whatever else it carries', () => {
    const md = renderEntry(e, { origin: 'local', seedModifiedAt: '2026-09-19T10:00:00Z' });
    expect(md).toContain('ADDED HERE');
    expect(md).not.toContain('EDITED HERE');
  });

  it('puts the provenance last, after the note', () => {
    const withNote = LIVE.find(x => x.reviewerNote);
    const lines = renderEntry(withNote, { origin: 'local' }).trimEnd().split('\n');
    expect(lines[lines.length - 1]).toMatch(/^\| \*\*Provenance\*\* \|/);
  });

  // ⭐ The silence is load-bearing: if this line appeared on every row, the gate
  // could no longer tell a real divergence from its own arrival.
  it('leaves the whole section unchanged when every row is unmodified seed', () => {
    const allSeed = Object.fromEntries(LIVE.map(x => [x.key, { origin: 'seed', seedModifiedAt: null }]));
    expect(renderSection6(STATUTORY_TEMPLATE, allSeed)).toBe(section);
  });
});

describe('buildStatementSection6 — the file somebody receives', () => {
  const base = { entries: STATUTORY_TEMPLATE, generatedAt: '19 Sep 2026, 15:42' };

  it('refuses to generate from an empty register', () => {
    // ⛔ An empty §6 reads as "this building has no periodic obligations".
    expect(() => buildStatementSection6({ ...base, entries: [] })).toThrow(/empty register/);
    expect(() => buildStatementSection6({ ...base, entries: undefined })).toThrow(/empty register/);
  });

  it('stamps when it was generated and carries no revision number', () => {
    const md = buildStatementSection6(base);
    expect(md).toContain('Generated:   19 Sep 2026, 15:42');
    // ⚠ The BANNER only — register rows legitimately discuss revisions of the
    // standards they cite. The standing rule is about the document's header:
    // it carries a generated-at date and no revision number, decided 2026-09-17.
    const banner = md.slice(0, md.indexOf('-->'));
    expect(banner).not.toMatch(/revision/i);
  });

  it('puts the banner in a comment, so pasting it in does not show it', () => {
    const md = buildStatementSection6(base);
    expect(md.startsWith('<!--')).toBe(true);
    expect(md.indexOf('-->')).toBeLessThan(md.indexOf('## 6. The register'));
  });

  it('says plainly when it is the shipped seed and not this building’s register', () => {
    const md = buildStatementSection6({ ...base, source: 'seed' });
    expect(md).toContain('THE SHIPPED STANDARD REGISTER');
    expect(md).not.toContain('this building’s register, held in the system');
  });

  it('reports how many rows were added or edited here', () => {
    const provenance = {
      [LIVE[0].key]: { origin: 'local' },
      [LIVE[1].key]: { origin: 'seed', seedModifiedAt: '2026-09-19T10:00:00Z' },
    };
    const md = buildStatementSection6({ ...base, provenance });
    expect(md).toContain('Added here:  1');
    expect(md).toContain('Edited here: 1');
  });

  it('says so when nothing has been changed here', () => {
    expect(buildStatementSection6(base)).toContain('Local edits: none');
  });

  it('contains the section itself, unaltered', () => {
    expect(buildStatementSection6(base)).toContain(section.trimEnd());
  });
});

describe('the label helpers', () => {
  it('names an interval in the document’s words, not the app’s', () => {
    expect(intervalLabel({ frequencyDays: 183 })).toBe('Six-monthly');
    expect(intervalLabel({ frequencyDays: 1 })).toBe('Daily');
    expect(intervalLabel({ frequencyDays: 730 })).toBe('Two-yearly');
  });

  it('says an assurance row is a confirmation rather than how often it runs', () => {
    expect(intervalLabel({ frequencyDays: 365, assuranceOnly: 'the event-driven row' }))
      .toBe('Annual assurance confirmation');
  });

  it('does not call a row with no frequency a cycle', () => {
    expect(intervalLabel({ trigger: 'on an event' })).toMatch(/no fixed/);
    expect(intervalSourceLabel({})).toBe('Not a cycle — see the trigger');
  });

  // ⚠ Round 13: on a standard-based row, "stated in the reference" has to say
  // what it means — the edition and configuration governing THIS installation.
  it('qualifies "stated in the reference" on a standard-based row', () => {
    const std = intervalSourceLabel({ frequencyDays: 365, intervalBasis: 'stated', basis: 'standard' });
    const law = intervalSourceLabel({ frequencyDays: 365, intervalBasis: 'stated', basis: 'statute' });
    expect(std).toContain('THIS installation');
    expect(law).toBe('Stated in the reference');
  });

  it('renders retention in years, and nothing at all when there is none', () => {
    expect(retentionLabel(36)).toBe('3 years');
    expect(retentionLabel(12)).toBe('1 year');
    expect(retentionLabel(18)).toBe('18 months');
    expect(retentionLabel(0)).toBeNull();
    expect(retentionLabel(undefined)).toBeNull();
  });
});
