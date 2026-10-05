// The Building Assets report is built in the browser by default and on the
// server as the swap-back (2026-10-05). Both must produce the same document.
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('$app/env', () => ({ browser: false, dev: false, building: false }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => ({ user: { id: 'u' } }) }));
vi.mock('#lib/server/identity.js', () => ({ documentBuildingName: async () => 'Test House' }));

const { buildComponentReport, ReportInputError } = await import('./componentReport.js');
const { POST } = await import('../../routes/api/generate-report/+server.js');

// A 1×1 PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const component = (i) => ({
  floor_short: 'G', type_name: 'Fire door', asset_id: `D${i}`, label: `Door ${i} & "co"`,
  status: ['ok', 'failed'][i % 2], attributes: [{ name: 'Rating', value: 'FD30', display_type: 'dropdown' }],
  condition_results: [{ name: 'Gap', passed: true }], last_inspected: '2026-07-01T10:00:00Z', notes: 'a\nb',
});
const options = { reportTypes: ['full_list', 'floor_summary', 'full_component_list', 'full_summary'],
  generatedAt: '5 Oct 2026, 10:00', filterSummary: 'All components', showNotes: true };
const floors = () => [{ floor: { id: 'g', name: 'Ground', short_name: 'G', level_order: 0 },
  components: [0, 1, 2].map(component), imageWidth: 1, imageHeight: 1 }];

const documentXml = async (bytes) => (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');

describe('componentReport — the same file in the browser and on the server', () => {
  it('builds the same document.xml as the server route for the same input', async () => {
    const all = floors()[0].components;
    const here = await buildComponentReport({ building: 'Test House', options, floors: floors(), allComponents: all });
    const res = await POST({ request: new Request('http://x', { method: 'POST',
      body: JSON.stringify({ options, floors: floors(), allComponents: all }) }) });
    expect(res.status).toBe(200);
    expect(await documentXml(here.bytes)).toBe(await documentXml(new Uint8Array(await res.arrayBuffer())));
    expect(here.filename).toBe(/filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1]);
  });

  it('takes a plan as plain bytes, as the browser supplies it, and places it', async () => {
    const { bytes } = await buildComponentReport({ building: 'Test House',
      options: { reportTypes: ['plan'] }, floors: floors(), allComponents: [], imageOf: async () => PNG });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
  });

  it('refuses a request with nothing to build, as a request fault', async () => {
    await expect(buildComponentReport({ building: 'x', options: { reportTypes: [] }, floors: floors() }))
      .rejects.toBeInstanceOf(ReportInputError);
  });
});
