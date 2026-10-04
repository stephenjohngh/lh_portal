// src/routes/api/reports/generate-minutes-docx/server.test.js
//
// The minutes report prints each activity as plain text. Two faults, fixed
// 2026-09-28 and read here from the packed document.xml:
//   · a "\n" inside one Word run is shown as a SPACE, so every multi-paragraph
//     comment printed on one line;
//   · htmlToText ran a heading into the paragraph after it, and would have run
//     a pasted table's cells together.

import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://localhost', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' } }));
vi.mock('$app/env', () => ({ browser: false, dev: false, building: false }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => ({ user: { id: 'u1' }, error: null }) }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');

async function minutesXml(body) {
  const payload = {
    meeting: { id: 'm1', title: 'Board', meeting_date: '2026-09-01', meeting_type: 'board', status: 'closed' },
    attendees: [],
    issues: [{
      id: 'i1', name: 'Fire doors', issue_number: 7, priority: 1, meeting_id: 'm1', actions: [],
      activities: [{ id: 'a1', meeting_id: 'm1', activity_type: 'comment', created_at: '2026-09-01T10:00:00Z', body }],
    }],
  };
  const res = await POST(/** @type {any} */ ({ request: new Request('http://x', { method: 'POST', body: JSON.stringify(payload) }) }));
  expect(res.status).toBe(200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('no document.xml');
  return file.async('string');
}

describe('POST /api/reports/generate-minutes-docx', () => {
  it('puts each paragraph, heading and table row of a comment on its own line', async () => {
    const xml = await minutesXml(
      '<h2>Survey</h2><p>First para</p><p>Second para</p>'
      + '<table><tbody><tr><th><p>Door</p></th><th><p>Result</p></th></tr>'
      + '<tr><td><p>D1</p></td><td><p>Pass</p></td></tr></tbody></table>');
    // The comment's paragraph: its runs, in order, with a break between lines.
    const para = xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*Survey[\s\S]*?<\/w:p>/)?.[0] ?? '';
    const runs = [...para.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => ({
      broken: m[1].includes('<w:br/>'),
      text:   m[1].match(/<w:t[^>]*>([^<]*)<\/w:t>/)?.[1] ?? '',
    }));
    const lines = runs.map((r) => r.text).filter(Boolean);
    expect(lines).toEqual(['Survey', 'First para', 'Second para', 'Door | Result', 'D1 | Pass']);
    // Every line after the first starts with a real break, never a raw newline.
    expect(runs.slice(1).filter((r) => r.text).every((r) => r.broken)).toBe(true);
    expect(para).not.toMatch(/<w:t[^>]*>[^<]*\n/);
  });
});
