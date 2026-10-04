// src/lib/server/morLetterTemplates.test.js
// The letters to residents are signed and headed from Admin → Other Config →
// Building & business — not from a name and placeholders written into the code
// (2026-10-03). Read from the PACKED file: what a recipient gets.
import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import {
  buildReporterBsrLetter, buildReporterClosureLetter,
  buildReporterHoldingLetter, buildResidentsClosureLetter,
} from './morLetterTemplates.js';

const CASE = {
  reference: 'MOR-2026-001', status: 'in_triage', identification_date: '2026-09-01',
  reporter_name: 'A Resident', reporter_address: null, description: 'A concern',
};

async function textOf(doc) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file('word/document.xml')?.async('string') ?? '';
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
}

const BUILDERS = [buildReporterBsrLetter, buildReporterClosureLetter, buildReporterHoldingLetter, buildResidentsClosureLetter];

describe('MOR letters', () => {
  it('are headed with the building and signed by the person an admin set', async () => {
    const opts = {
      building: 'Riverside Court',
      organisation: { signatoryName: 'Sam Smith', signatoryRole: 'Building Safety Manager', signatoryContact: 'bsm@example.org' },
    };
    for (const build of BUILDERS) {
      const text = await textOf(build(CASE, opts));
      expect(text).toContain('Riverside Court');
      expect(text).toContain('Sam Smith');
      expect(text).toContain('bsm@example.org');
      expect(text).not.toMatch(/\[Building Safety Manager name\]|Lonsdale House|Lancaster House/);
    }
  });

  it('with nothing set, print placeholders to be filled in — never a guessed name', async () => {
    const text = await textOf(buildReporterHoldingLetter(CASE));
    expect(text).toContain('[Building name]');
    expect(text).toContain('[Building Safety Manager name]');
  });
});
