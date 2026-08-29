// @vitest-environment jsdom
// src/lib/utils/editorSearchCommands.test.js
//
// Driving a REAL editor, because the bugs these pin were not in the matching —
// which was already tested and correct — but in how the commands talked to
// Tiptap. The first version built its own transaction and dispatched it while
// Tiptap dispatched its own, so the arrows did nothing and the count trailed a
// keystroke behind. Neither fault is visible without an editor to dispatch on.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorSearch, searchState } from './editorSearchExtension.js';

let editor;

beforeEach(() => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: [StarterKit, EditorSearch],
    content: '<p>the door</p><p>a second door</p><p>and a third door</p>',
  });
});

afterEach(() => editor?.destroy());

describe('setSearchQuery', () => {
  it('reports the count immediately, not one transaction later', () => {
    editor.commands.setSearchQuery('door');
    // Read straight back, exactly as the find bar does.
    expect(searchState(editor).count).toBe(3);
  });

  it('keeps up as a word is typed out', () => {
    // The reported fault: each keystroke showed the previous one's count.
    editor.commands.setSearchQuery('d');
    // Every 'd' in the three paragraphs: door, secon(d) door, an(d) thir(d) door.
    expect(searchState(editor).count).toBe(6);
    editor.commands.setSearchQuery('do');
    expect(searchState(editor).count).toBe(3);
    editor.commands.setSearchQuery('door');
    expect(searchState(editor).count).toBe(3);
    editor.commands.setSearchQuery('doors');
    expect(searchState(editor).count).toBe(0);
  });

  it('starts on the first match', () => {
    editor.commands.setSearchQuery('door');
    expect(searchState(editor).index).toBe(0);
  });

  it('clears back to nothing', () => {
    editor.commands.setSearchQuery('door');
    editor.commands.setSearchQuery('');
    expect(searchState(editor)).toMatchObject({ count: 0, index: -1, query: '' });
  });
});

describe('goToMatch', () => {
  beforeEach(() => editor.commands.setSearchQuery('door'));

  it('moves forwards', () => {
    expect(editor.commands.goToMatch(1)).toBe(true);
    expect(searchState(editor).index).toBe(1);
    editor.commands.goToMatch(1);
    expect(searchState(editor).index).toBe(2);
  });

  it('wraps at both ends', () => {
    editor.commands.goToMatch(1);
    editor.commands.goToMatch(1);
    editor.commands.goToMatch(1);
    expect(searchState(editor).index).toBe(0);

    editor.commands.goToMatch(-1);
    expect(searchState(editor).index).toBe(2);
  });

  it('SELECTS the match, so the editor scrolls and typing replaces it', () => {
    editor.commands.goToMatch(1);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('door');
  });

  it('does nothing when there is nothing to go to', () => {
    editor.commands.setSearchQuery('zebra');
    expect(editor.commands.goToMatch(1)).toBe(false);
  });
});

describe('editing while a search is open', () => {
  it('re-finds the matches when the document changes', () => {
    editor.commands.setSearchQuery('door');
    expect(searchState(editor).count).toBe(3);

    editor.commands.setContent('<p>only one door here</p>');
    expect(searchState(editor).count).toBe(1);
  });
});

describe('the find bar re-sending its query', () => {
  // What actually broke the arrows, and what the earlier tests could not see:
  // the editors re-assign `editor` on every transaction to refresh their
  // toolbars, so the bar's reactive block re-ran and re-sent the SAME query
  // after every arrow click. Treating that as a new search reset the index to
  // zero, so the highlight moved and was put back in the same breath.

  beforeEach(() => editor.commands.setSearchQuery('door'));

  it('keeps your place when the same query is sent again', () => {
    editor.commands.goToMatch(1);
    expect(searchState(editor).index).toBe(1);

    editor.commands.setSearchQuery('door');          // the re-send
    expect(searchState(editor).index).toBe(1);
  });

  it('still starts from the first hit when the query really changes', () => {
    editor.commands.goToMatch(1);
    editor.commands.goToMatch(1);
    expect(searchState(editor).index).toBe(2);

    editor.commands.setSearchQuery('second');
    expect(searchState(editor).index).toBe(0);
  });

  it('survives a re-send between every step', () => {
    // The real sequence: click, transaction, re-send, click, transaction…
    for (const expected of [1, 2, 0]) {
      editor.commands.goToMatch(1);
      editor.commands.setSearchQuery('door');
      expect(searchState(editor).index).toBe(expected);
    }
  });
});
