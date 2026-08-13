// src/lib/apps/dossier/utils/datasetRender.test.js
// Type-1 tests. No DOM: the renderer builds a string so it can also run against
// a P3 snapshot server-side.

import { describe, it, expect } from 'vitest';
import {
  renderDatasetTableHtml, renderMissingDatasetHtml, escapeHtml,
} from './datasetRender.js';

const chronology = { id: 'ds1', key: 'chronology', title: 'Chronology' };
const rec = (id, fields, position = 0) => ({ id, dataset_id: 'ds1', fields, position });

describe('renderDatasetTableHtml', () => {
  it('renders the template-s columns as headers', () => {
    const html = renderDatasetTableHtml(chronology, []);
    expect(html).toContain('Chronology');
  });

  it('renders rows in the template-s sort order, not input order', () => {
    // The embedded table must agree with the table's own view; a chronology
    // shown out of order in a briefing would be worse than not showing it.
    const html = renderDatasetTableHtml(chronology, [
      rec('r1', { date: '2024-11-30', event: 'Works completed' }),
      rec('r2', { date: '2024-03-04', event: 'Survey commissioned' }),
    ]);
    expect(html.indexOf('Survey commissioned')).toBeLessThan(html.indexOf('Works completed'));
  });

  it('shows a dash for an empty cell rather than nothing', () => {
    // A blank cell reads as an oversight; a dash reads as deliberate.
    const html = renderDatasetTableHtml(chronology, [
      rec('r1', { date: '2024-01-01', event: 'x', significance: '' }),
    ]);
    expect(html).toContain('—');
  });

  it('says so when the table is empty', () => {
    expect(renderDatasetTableHtml(chronology, [])).toContain('no entries yet');
  });

  it('can omit the heading, for a caller that supplies its own', () => {
    const html = renderDatasetTableHtml(chronology, [], { heading: false });
    expect(html).not.toContain('dossier-dataset-title');
  });

  it('renders nothing for an unknown template', () => {
    expect(renderDatasetTableHtml({ id: 'x', key: 'invoices', title: 'X' }, [])).toBe('');
    expect(renderDatasetTableHtml(null, [])).toBe('');
  });

  it('escapes author text rather than letting it inject markup', () => {
    const html = renderDatasetTableHtml(chronology, [
      rec('r1', { date: '2024-01-01', event: '<img src=x onerror=alert(1)>' }),
    ]);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('escapes the table title too', () => {
    const html = renderDatasetTableHtml(
      { ...chronology, title: '<script>bad</script>' }, []);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderMissingDatasetHtml', () => {
  it('names the table that has gone, so the gap is explicable', () => {
    const html = renderMissingDatasetHtml('Chronology');
    expect(html).toContain('Chronology');
    expect(html).toContain('no longer exists');
  });

  it('escapes the remembered title', () => {
    expect(renderMissingDatasetHtml('<b>x</b>')).not.toContain('<b>');
  });

  it('copes with no remembered title', () => {
    expect(renderMissingDatasetHtml()).toContain('Table');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that matter in text and attributes', () => {
    expect(escapeHtml('<a href="x">&</a>'))
      .toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('handles nullish input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('renderDatasetTableHtml — row references', () => {
  // A row can point at the page or file holding the fuller story. The editor
  // has its own control for this; the read-only renderer has to draw it, or a
  // published pack silently drops every reference the author made.
  const dataset = { id: 'ds1', key: 'chronology', title: 'Chronology' };
  const rows = [
    { id: 'r1', fields: { date: '2025-01-13', event: 'Notice served' }, doc_id: 'd1' },
    { id: 'r2', fields: { date: '2025-01-14', event: 'Reply' }, document_id: 'f1' },
  ];
  const links = {
    docs:  [{ id: 'd1', title: 'The notice' }],
    files: [{ id: 'f1', display_name: 'Reply.pdf' }],
    assetBase: '/api/pack/TOKEN/file/',
  };

  it('draws no Detail column when no references are supplied', () => {
    const html = renderDatasetTableHtml(dataset, rows);
    expect(html).not.toContain('Detail');
    expect(html).not.toContain('dossier-record-link');
  });

  it('draws no Detail column when no row actually has a reference', () => {
    // An empty column on every table would be clutter on the many packs that
    // never use the feature.
    const plain = [{ id: 'r1', fields: { date: '2025-01-13', event: 'x' } }];
    expect(renderDatasetTableHtml(dataset, plain, { links })).not.toContain('Detail');
  });

  it('links a page reference by title, for the reader to intercept', () => {
    const html = renderDatasetTableHtml(dataset, rows, { links });
    expect(html).toContain('<th style="width:10rem">Detail</th>');
    expect(html).toContain('data-doc-id="d1"');
    expect(html).toContain('The notice');
  });

  it('links a file reference to the caller-s asset base', () => {
    const html = renderDatasetTableHtml(dataset, rows, { links });
    expect(html).toContain('href="/api/pack/TOKEN/file/f1"');
    expect(html).toContain('Reply.pdf');
    expect(html).toContain('target="_blank"');
  });

  it('names a file it cannot link, rather than pretending it opens', () => {
    const html = renderDatasetTableHtml(dataset, rows, {
      links: { ...links, assetBase: '' },
    });
    expect(html).toContain('dossier-record-link-plain');
    expect(html).not.toContain('<a class="dossier-record-link" target');
  });

  it('leaves a dash for rows with no reference', () => {
    const mixed = [...rows, { id: 'r3', fields: { date: '2025-01-15', event: 'z' } }];
    const html = renderDatasetTableHtml(dataset, mixed, { links });
    // Header + three body rows, the last with an empty Detail cell.
    expect(html.match(/<td>—<\/td>/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('survives a reference whose target has been deleted', () => {
    // doc_id is ON DELETE SET NULL, so an id with no page is possible; a file
    // can leave the shelf entirely.
    const orphan = [
      { id: 'r1', fields: { event: 'a' }, doc_id: 'gone' },
      { id: 'r2', fields: { event: 'b' }, document_id: 'gone' },
    ];
    const html = renderDatasetTableHtml(dataset, orphan, { links });
    expect(html).not.toContain('data-doc-id="gone"');
    // The file still resolves to a link under a generic name — the manifest
    // decides whether it actually serves.
    expect(html).toContain('/api/pack/TOKEN/file/gone');
  });

  it('escapes a reference-s label', () => {
    const html = renderDatasetTableHtml(dataset,
      [{ id: 'r1', fields: { event: 'a' }, doc_id: 'd9' }],
      { links: { ...links, docs: [{ id: 'd9', title: '<script>x</script>' }] } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script');
  });
});
