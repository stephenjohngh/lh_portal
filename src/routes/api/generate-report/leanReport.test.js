// The Building Assets Word report keeps its table cells LEAN (2026-10-05).
//
// docx's packing cost is per table cell, and this report has a row per
// component — 1,092 on this building. With every cell carrying its own
// borders, margins, font and white shading it peaked near 1 GB and the server
// was killed (HTTP 503 on both hosts). Those are now said once, on the table
// and by the document default, which more than halved the peak with an
// identical look (checked cell by cell against the old output). These tests
// hold the shape that saving depends on.
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('$app/env', () => ({ browser: false, dev: false, building: false }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => ({ user: { id: 'u' } }) }));
vi.mock('#lib/server/identity.js', () => ({ documentBuildingName: async () => 'Test House' }));

const { POST } = await import('./+server.js');

const component = (i) => ({
  floor_short: 'G', floor_order: 0, system_name: 'Fire', type_name: 'Fire door',
  asset_id: `D${i}`, label: `Door ${i}`, status: i % 3 ? 'ok' : 'failed',
  attributes: [{ name: 'Rating', value: 'FD30', display_type: 'dropdown' }],
  condition_results: [{ name: 'Gap', passed: true }, { name: 'Closer', passed: false }],
  last_inspected: '2026-07-01T10:00:00Z', notes: 'A note', spaces: 'Flat 1',
});

async function documentXml(reportTypes) {
  const comps = Array.from({ length: 6 }, (_, i) => component(i));
  const body = {
    options: { building: 'Sent by the browser', reportTypes, showNotes: true, showSpaces: true },
    floors: [{ floor: { id: 'g', name: 'Ground', short_name: 'G', level_order: 0 }, components: comps }],
    allComponents: comps,
  };
  const res = await POST({ request: new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) });
  expect(res.status).toBe(200);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  return zip.file('word/document.xml').async('string');
}

const ALL = ['full_list', 'floor_summary', 'full_component_list', 'full_summary'];

describe('the Building Assets report keeps table cells lean', () => {
  it('builds tables (so the checks below are not vacuous)', async () => {
    const xml = await documentXml(ALL);
    expect((xml.match(/<w:tc>/g) ?? []).length).toBeGreaterThan(50);
  });

  it('gives no cell its own borders or margins — the tables carry them', async () => {
    const xml = await documentXml(ALL);
    expect(xml).not.toMatch(/<w:tcBorders>/);
    expect(xml).not.toMatch(/<w:tcMar>/);
    const tables = (xml.match(/<w:tbl>/g) ?? []).length;
    expect((xml.match(/<w:tblBorders>/g) ?? []).length).toBe(tables);
    expect((xml.match(/<w:tblCellMar>/g) ?? []).length).toBe(tables);
  });

  it('names no font inside a table — the document default is Arial', async () => {
    const xml = await documentXml(ALL);
    const cells = (xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).join('');
    expect(cells).not.toMatch(/<w:rFonts/);
  });

  it('shades no cell white, which is what an unshaded cell already is', async () => {
    const xml = await documentXml(ALL);
    expect(xml).not.toMatch(/<w:shd [^>]*w:fill="FFFFFF"/i);
  });

  it('prints the building as an admin named it, not what the browser sent', async () => {
    const xml = await documentXml(['full_list']);
    expect(xml).toContain('Test House');
    expect(xml).not.toContain('Sent by the browser');
  });

  it('takes each plan as a binary file part of the form, and places it in the document', async () => {
    // A 1×1 PNG.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('image0', new Blob([png], { type: 'image/png' }), 'floor-0.png');
    form.append('payload', JSON.stringify({
      options: { reportTypes: ['plan'] },
      floors: [{ floor: { id: 'g', name: 'Ground', short_name: 'G', level_order: 0 }, components: [component(1)],
        imagePart: 'image0', imageWidth: 1, imageHeight: 1 }],
      allComponents: [],
    }));
    const res = await POST({ request: new Request('http://x', { method: 'POST', body: form }) });
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    expect(await zip.file('word/document.xml').async('string')).toMatch(/<w:drawing>/);
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
  });
});

