// @vitest-environment jsdom
// src/lib/apps/dossier/utils/assetNode.test.js
//
// Where the asset block's edit controls sit. They float in the top-right
// corner, which is harmless over an image — and over a file card is exactly
// where the card's Open link is. Reported 2026-09-24: the Name / Description /
// remove strip covered Open on an uploaded document placed on a page.
//
// The node view tags its host `data-layout`: `overlay` for an image, `beside`
// for everything else, and the stylesheet lays the strip out from that. So the
// thing to pin is the tag, per kind of file.
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Asset } from './assetNode.js';

/** @type {Editor|null} */
let editor = null;
afterEach(() => { editor?.destroy(); editor = null; });

function mount(attrs) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: [Document, Paragraph, Text, Asset],
    content: { type: 'doc', content: [{ type: 'asset', attrs }] },
  });
  const host = element.querySelector('.dossier-asset-host');
  if (!host) throw new Error('no asset host rendered');
  return /** @type {HTMLElement} */ (host);
}

const file = (filename, mime_type) =>
  ({ document_id: 'd1', filename, mime_type, provider_file_id: 'abc123', size_bytes: 2048 });

describe('asset block controls', () => {
  it('puts the controls beside a file card, so they cannot cover Open', () => {
    const host = mount(file('Lease.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(host.querySelector('.dossier-asset-action')?.textContent).toBe('Open');
    expect(host.dataset.layout).toBe('beside');
  });

  it('does the same for a PDF card', () => {
    const host = mount(file('Survey.pdf', 'application/pdf'));
    expect(host.querySelector('.dossier-asset-action')?.textContent).toBe('Open PDF');
    expect(host.dataset.layout).toBe('beside');
  });

  it('keeps an image’s controls floating over the picture', () => {
    const host = mount(file('Front.jpg', 'image/jpeg'));
    expect(host.querySelector('img')).not.toBeNull();
    expect(host.dataset.layout).toBe('overlay');
  });

  // The CSS is the other half. Without the 'beside' rules the tag does
  // nothing and the strip is absolute again.
  it('has stylesheet rules that take the strip out of the corner', async () => {
    // Read from the repo root: under jsdom import.meta.url is not a file URL.
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(
      'src/lib/apps/dossier/components/BlockContent.svelte', 'utf8');
    const rule = css.match(
      /\[data-layout='beside'\] \.dossier-block-controls\)\s*\{([^}]*)\}/);
    expect(rule, 'no beside rule for the control strip').not.toBeNull();
    expect(rule[1]).toMatch(/position:\s*static/);
  });
});
