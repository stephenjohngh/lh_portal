// src/routes/api/golden-thread/safety-case/server.test.js
//
// ⛔ From 2026-09-19 (5932c1f) to 2026-09-28 every safety case export threw
// "TableLayoutType is not defined": the fixed-layout fix added the symbol to
// docTable and not to the import. `npm run check` runs with checkJs off and
// cannot see an undefined name, so only running the route shows it.

import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { buildSafetyCaseModel } from '$lib/apps/golden_thread/utils/gtSafetyCase.js';

vi.mock('$lib/server/requireAuth', () => ({ requireAuth: async () => ({ user: { id: 'u1' }, error: null }) }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
// The building as an admin named it (Admin → Building & business).
vi.mock('$lib/server/identity.js', () => ({ documentBuildingName: async () => 'Riverside Court' }));

const { POST } = await import('./+server.js');

describe('POST /api/golden-thread/safety-case', () => {
  it('produces a Word file from a real model, tables included', async () => {
    const model = buildSafetyCaseModel({
      generatedAt: '2026-09-28T10:00:00Z',
      building: 'Lonsdale House',
      accountablePersons: [{ id: 'ap1', role: 'principal', name: 'A Person', organisation: 'Org', active: true }],
    });
    const res = await POST(/** @type {any} */ ({
      request: new Request('http://x', { method: 'POST', body: JSON.stringify(model) }),
    }));
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const file = zip.file('word/document.xml');
    if (!file) throw new Error('no document.xml');
    const xml = await file.async('string');
    expect(xml).toContain('Safety Case Summary');
    // The building comes from the setting, not from what the request carried.
    expect(xml).toContain('Riverside Court');
    expect(xml).not.toContain('Lonsdale House');
    expect(xml).toMatch(/<w:tbl>/);
    expect(xml).toMatch(/<w:tblLayout w:type="fixed"\/>/);
  });
});
