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
