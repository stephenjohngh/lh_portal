// src/lib/server/morLetterTemplates.test.js
// The letters to residents are signed and headed from Admin → Other Config →
// Building & business — not from a name and placeholders written into the code
// (2026-10-03). Read from the PACKED file: what a recipient gets.
import { describe, it, expect, afterEach } from 'vitest';
import { setWording } from '$lib/utils/wording.js';
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

  // The words are an admin setting (Admin → Other Config → Wording, 2026-10-04).
  describe('wording', () => {
    afterEach(() => setWording(null));

    it('a text an admin saved is the one the letter carries', async () => {
      setWording({ morReporterHolding: '# {building} — Your report\n\nStill looking at it: {status}.' });
      const text = await textOf(buildReporterHoldingLetter(CASE, { building: 'Riverside Court' }));
      expect(text).toContain('Riverside Court — Your report');
      expect(text).toContain('Still looking at it: in initial review against the building safety threshold.');
      expect(text).not.toContain('Thank you for your patience');
    });

    it('lessons learned print only when the case has some, heading and all', async () => {
      const without = await textOf(buildReporterClosureLetter(CASE, {}));
      expect(without).not.toContain('Lessons learned');
      const withSome = await textOf(buildReporterClosureLetter({ ...CASE, lessons_learned: 'Check the door closers monthly.' }, {}));
      expect(withSome).toContain('Lessons learned');
      expect(withSome).toContain('Check the door closers monthly.');
    });

    it('the escalation letter says the BSR reference when there is one, and that it will follow when not', async () => {
      expect(await textOf(buildReporterBsrLetter(CASE, {}))).toContain('once it is issued');
      const issued = await textOf(buildReporterBsrLetter({ ...CASE, bsr_notice_ref: 'BSR-77' }, {}));
      expect(issued).toContain('Our BSR notice reference is BSR-77');
      expect(issued).not.toContain('once it is issued');
    });

    it('the residents notice has no recipient or case reference block', async () => {
      const text = await textOf(buildResidentsClosureLetter(CASE, {}));
      expect(text).toContain('To all residents and other users of the building');
      expect(text).not.toContain('Our reference');
      expect(text).not.toContain('A Resident');
    });
  });
});
