// src/routes/api/reports/generate-docx/server.test.js
//
// The issues Word report, run end to end.
//
// ⛔ From 2026-09-19 (5932c1f) to 2026-09-28 it threw on the FIRST issue:
// its header table used TableLayoutType and nothing imported it. The gate
// (`npm run check`, checkJs off) cannot see an undefined name.
//
// Also the path a pasted-markdown activity takes into the report
// (richTextDocx.js): a table in a comment must reach the document as a table.

import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => ({ user: { id: 'u1' }, error: null }) }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');

async function reportXml(issues) {
  const res = await POST(/** @type {any} */ ({
    request: new Request('http://x', { method: 'POST', body: JSON.stringify({
      issues, includeCurrent: true, includeParked: true, includeCompleted: true, sortOrder: 'asc',
    }) }),
  }));
  expect(res.status).toBe(200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('no document.xml');
  return file.async('string');
}

describe('POST /api/reports/generate-docx', () => {
  it('prints an issue, and a comment\'s pasted table as a Word table', async () => {
    const xml = await reportXml([{
      id: 'i1', issue_number: 7, name: 'Fire doors', status: 'current', priority: 1,
      created_at: '2026-09-01T10:00:00Z', actions: [],
      activities: [{
        id: 'a1', activity_type: 'comment', created_at: '2026-09-02T10:00:00Z',
        body: '<h2>Survey</h2><p>Findings below.</p>'
            + '<table><tbody><tr><th><p>Door</p></th><th><p>Result</p></th></tr>'
            + '<tr><td><p>D1</p></td><td><p>Pass</p></td></tr></tbody></table>',
      }],
    }]);
    expect(xml).toContain('Fire doors');
    expect(xml).toContain('Survey');
    // The issue header is one table; the pasted comment is the second.
    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
    expect(tables.length).toBeGreaterThanOrEqual(2);
    expect(tables.some((t) => t.includes('Door') && t.includes('Pass'))).toBe(true);
  });
});
