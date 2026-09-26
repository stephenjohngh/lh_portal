// src/lib/server/parkingBayPlanDocx.test.js
// The caretaker's bay plan. Read back from the PACKED file: what matters is
// what Word will show, and only the unzipped XML says that.
import { describe, it, expect } from 'vitest';
import { planLayout, buildBayPlanBuffer } from './parkingBayPlanDocx.js';

// A 1×1 PNG: the smallest image a Word ImageRun will accept.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function xmlOf(buf) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  return {
    body: await zip.file('word/document.xml').async('string'),
    header: (await Promise.all(Object.keys(zip.files).filter(n => /word\/header\d*\.xml/.test(n))
      .map(n => zip.file(n).async('string')))).join(''),
  };
}

describe('planLayout — both levels on one page', () => {
  it('puts tall plans side by side on a landscape page', () => {
    const l = planLayout([{ width: 800, height: 1200 }, { width: 800, height: 1200 }]);
    expect(l.landscape).toBe(true);
    expect(l.stacked).toBe(false);
  });
  it('stacks wide plans on a portrait page', () => {
    const l = planLayout([{ width: 2000, height: 900 }, { width: 2000, height: 900 }]);
    expect(l.stacked).toBe(true);
  });
  it('fits every plan inside its share of the page, never enlarging one', () => {
    for (const levels of [
      [{ width: 3000, height: 4000 }, { width: 3000, height: 4000 }],
      [{ width: 5000, height: 1500 }, { width: 5000, height: 1500 }],
      [{ width: 300, height: 200 }, { width: 300, height: 200 }],
    ]) {
      const { sized, stacked } = planLayout(levels);
      const totalH = stacked ? sized.reduce((t, s) => t + s.dH, 0) : Math.max(...sized.map(s => s.dH));
      expect(totalH).toBeLessThanOrEqual(stacked ? 900 : 560);
      for (const s of sized) expect(s.dW).toBeLessThanOrEqual(s.width);
    }
  });
});

describe('the Word file', () => {
  const body = {
    building: 'Lancaster House', generatedAt: '26 Sep 2026',
    levels: [
      { name: 'Upper Basement', imageBase64: PNG, width: 800, height: 1200 },
      { name: 'Lower Basement', imageBase64: PNG, width: 800, height: 1200 },
    ],
    rows: [['L/PK/22', 'Car', 'Allocated', 'Alice Example', 'AB12CDE'], ['L/PK/25', 'Large car', 'Free', 'Free', '']],
    legend: [{ label: 'Free', colour: '#22c55e' }, { label: 'Allocated', colour: '#3b82f6' }],
  };

  it('packs, with both levels named on the first page and every bay in the list', async () => {
    const { body: xml } = await xmlOf(await buildBayPlanBuffer(body));
    expect(xml).toContain('Upper Basement');
    expect(xml).toContain('Lower Basement');
    expect((xml.match(/<w:drawing>/g) ?? []).length).toBe(2);   // two plan images
    for (const cell of ['L/PK/22', 'Alice Example', 'AB12CDE', 'L/PK/25']) expect(xml).toContain(cell);
    // The plans come before the page break, the list after it.
    expect(xml.indexOf('Lower Basement')).toBeLessThan(xml.indexOf('w:type="page"'));
    expect(xml.indexOf('L/PK/22')).toBeGreaterThan(xml.indexOf('w:type="page"'));
  });

  // ⚠ It names people; the header says so on every page.
  it('says in its header that it contains personal data', async () => {
    const { header } = await xmlOf(await buildBayPlanBuffer(body));
    expect(header).toMatch(/personal data/);
  });

  // Word sizes columns from the grid, not the cells (tableGridGuard.test.js).
  it('declares real column widths, not the placeholder grid', async () => {
    const { body: xml } = await xmlOf(await buildBayPlanBuffer(body));
    const grids = [...xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(m => Number(m[1]));
    expect(grids.length).toBeGreaterThan(0);
    expect(grids.every(w => w > 100)).toBe(true);
  });

  it('refuses rather than printing a plan page with no plans', async () => {
    await expect(buildBayPlanBuffer({ ...body, levels: [] })).rejects.toThrow(/No basement plan/);
  });
});
