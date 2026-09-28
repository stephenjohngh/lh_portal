// @vitest-environment jsdom
// src/lib/utils/richTextExtensions.test.js
//
// Pasting markdown into an Info note or a Management activity, end to end, in a
// REAL editor built from the app's own extension list (2026-09-28).
//
// The three places a pasted table could be lost are three different layers,
// and each fails silently: the paste can flatten it (MarkdownPaste without
// `tables`), the schema can drop it (no table nodes), and the sanitiser can
// strip it on save (no table tags in its allow-list). Only a test that goes
// paste → getHTML → sanitise → reload sees all three at once.

import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { richTextExtensions } from './richTextExtensions.js';
import { sanitizeHtml } from './sanitizeHtml.js';

/** @type {Editor[]} */
let editors = [];
afterEach(() => { editors.forEach((e) => e.destroy()); editors = []; });

function makeEditor({ markdown = true, content = '' } = {}) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions: richTextExtensions({ markdown }), content });
  editors.push(editor);
  return editor;
}

/** Deliver a plain-text paste the way the browser does, through the plugins. */
function pastePlain(editor, text) {
  const event = /** @type {any} */ ({
    clipboardData: { getData: (type) => (type === 'text/plain' ? text : '') },
    preventDefault() {},
  });
  return editor.view.someProp('handlePaste', (f) => f(editor.view, event, /** @type {any} */ (null)));
}

const TABLE_MD = [
  '| Item | Due |',
  '| --- | --- |',
  '| Fire doors | March |',
  '| **EICR** | 2027 |',
].join('\n');

describe('markdown pasted into the rich-text editor', () => {
  it('turns a markdown table into a real table', () => {
    const editor = makeEditor();
    expect(pastePlain(editor, TABLE_MD)).toBe(true);
    const html = editor.getHTML();
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/<th[^>]*><p>Item<\/p><\/th>/);
    expect(html).toMatch(/<td[^>]*><p>Fire doors<\/p><\/td>/);
    expect(html).toMatch(/<strong>EICR<\/strong>/);
  });

  it('keeps three heading levels apart, one step below the note title', () => {
    const editor = makeEditor();
    pastePlain(editor, '# One\n\ntext\n\n## Two\n\ntext\n\n### Three\n\ntext');
    const html = editor.getHTML();
    expect(html).toContain('<h2>One</h2>');
    expect(html).toContain('<h3>Two</h3>');
    expect(html).toContain('<h4>Three</h4>');
    expect(html).not.toMatch(/<h1/);
  });

  it('keeps quotes, code, rules, strikethrough and links', () => {
    const editor = makeEditor();
    pastePlain(editor, [
      '> quoted', '', '```', 'code line', '```', '', '---', '',
      'some ~~struck~~ text and [a link](https://example.com)',
    ].join('\n'));
    const html = editor.getHTML();
    expect(html).toMatch(/<blockquote>/);
    expect(html).toMatch(/<pre><code>code line/);
    expect(html).toMatch(/<hr>/);
    expect(html).toMatch(/<s>struck<\/s>/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/example.com"/);
  });

  // ⛔ The layer that would have lost it with no error: the table was in the
  // editor and the sanitiser flattened it on the way to the database.
  it('survives the sanitiser on save, and loads back as the same table', () => {
    const first = makeEditor();
    pastePlain(first, `## Schedule\n\n${TABLE_MD}`);
    const saved = sanitizeHtml(first.getHTML());
    expect(saved).toMatch(/<table/);
    expect(saved).toMatch(/<th[^>]*>/);
    expect(saved).toMatch(/<td[^>]*><p>March<\/p><\/td>/);
    expect(saved).toContain('<h3>Schedule</h3>');

    const reopened = makeEditor({ content: saved });
    const json = /** @type {any} */ (reopened.getJSON());
    const table = json.content?.find((/** @type {any} */ n) => n.type === 'table');
    expect(table?.content).toHaveLength(3);                      // header + 2 rows
    expect(table?.content?.[0].content?.[0].type).toBe('tableHeader');
  });

  it('with markdown off, is the plain comment box: no conversion, no tables', () => {
    const editor = makeEditor({ markdown: false });
    expect(pastePlain(editor, TABLE_MD)).toBeFalsy();
    expect(editor.schema.nodes.table).toBeUndefined();
    expect(editor.schema.nodes.heading).toBeUndefined();
  });
});

describe('sanitizeHtml and tables', () => {
  it('keeps the table and its spans, drops inline style and anything active', () => {
    const out = sanitizeHtml(
      '<table style="min-width:75px"><colgroup><col style="width:9px"></colgroup><tbody>'
      + '<tr><th colspan="2" rowspan="1" onclick="alert(1)"><p>A</p></th></tr>'
      + '<tr><td><p>B<script>alert(1)</script></p></td></tr></tbody></table>');
    expect(out).toMatch(/<table>/);
    expect(out).toMatch(/<th colspan="2" rowspan="1">/);
    expect(out).toMatch(/<td><p>B<\/p><\/td>/);
    expect(out).not.toMatch(/style=|onclick|script/);
  });
});
