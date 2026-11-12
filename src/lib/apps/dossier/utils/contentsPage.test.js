// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { buildExtensions } from './blockSchema.js';
import { contentsBlocks, findContentsPage } from './contentsPage.js';
import { extractLinks } from './docLinks.js';

const docs = [
  { id: 'c', title: 'Contents', slug: 'contents', parent_doc_id: null, order_index: 0 },
  { id: 'a', title: 'Summary', slug: 'summary', parent_doc_id: null, order_index: 1 },
  { id: 'b', title: 'Activity', slug: 'activity', parent_doc_id: null, order_index: 2 },
  { id: 'b1', title: 'Comment 1', slug: 'comment-1', parent_doc_id: 'b', order_index: 0 },
];

describe('contents page', () => {
  it('finds the top-level page called Contents', () => {
    expect(findContentsPage(docs)?.id).toBe('c');
    expect(findContentsPage([{ id: 'x', title: 'Contents', parent_doc_id: 'a' }])).toBeNull();
  });

  it('lists every other page as a link, nested as the tree is, in the editor’s schema', () => {
    const blocks = contentsBlocks(docs, 'c', () => 'u');
    expect(() => getSchema(buildExtensions()).nodeFromJSON(blocks).check()).not.toThrow();
    const ids = extractLinks(blocks).map(l => l.target_doc_id ?? l.targetDocId ?? l.target);
    expect(JSON.stringify(blocks)).not.toContain('"target_doc_id":"c"');
    expect(JSON.stringify(blocks)).toContain('"target_doc_id":"b1"');
    expect(ids.length).toBe(3);
    const top = blocks.content[1];
    expect(top.type).toBe('bulletList');
    expect(top.content).toHaveLength(2);
    expect(top.content[1].content[1].type).toBe('bulletList');   // Comment 1 under Activity
  });

  it('says so when there is nothing else to list', () => {
    const blocks = contentsBlocks([docs[0]], 'c', () => 'u');
    expect(JSON.stringify(blocks)).toContain('no other pages');
  });
});
