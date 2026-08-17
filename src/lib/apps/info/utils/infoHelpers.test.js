// src/lib/apps/info/utils/infoHelpers.test.js
// Pure helpers behind the Info app's sidebar and note form.

import { describe, it, expect } from 'vitest';
import { sectionNotes, parseTags, tagsToString, stripHtml } from './infoHelpers.js';

const note = (over = {}) => ({
  id: 'n1', section_id: 's1', title: 'A note', status: 'active', ...over,
});

describe('sectionNotes', () => {
  const notes = [
    note({ id: 'n1', section_id: 's1', title: 'First' }),
    note({ id: 'n2', section_id: 's2', title: 'Other section' }),
    note({ id: 'n3', section_id: 's1', title: 'Second' }),
  ];

  it('gives only the notes in that section', () => {
    expect(sectionNotes(notes, 's1').map(n => n.id)).toEqual(['n1', 'n3']);
  });

  it('leaves archived notes out', () => {
    // Archiving is how a note is taken out of the way; putting them back in the
    // one list that has no filter would undo that. They stay reachable through
    // the Archived toggle in the main list.
    const withArchived = [...notes, note({ id: 'n4', section_id: 's1', status: 'archived' })];
    expect(sectionNotes(withArchived, 's1').map(n => n.id)).toEqual(['n1', 'n3']);
  });

  it('preserves the order it was given', () => {
    // The store already returns notes pinned-first then most-recently-updated.
    // A second opinion here would only drift from it.
    const ordered = [
      note({ id: 'pinned', is_pinned: true }),
      note({ id: 'recent' }),
      note({ id: 'older' }),
    ];
    expect(sectionNotes(ordered, 's1').map(n => n.id))
      .toEqual(['pinned', 'recent', 'older']);
  });

  it('is empty for All Notes, which has no single section', () => {
    expect(sectionNotes(notes, null)).toEqual([]);
    expect(sectionNotes(notes, undefined)).toEqual([]);
  });

  it('survives being called before the notes have loaded', () => {
    expect(sectionNotes(undefined, 's1')).toEqual([]);
    expect(sectionNotes([], 's1')).toEqual([]);
  });
});

describe('parseTags / tagsToString', () => {
  it('splits, trims and drops the empties', () => {
    expect(parseTags(' fire , safety ,, ')).toEqual(['fire', 'safety']);
  });

  it('round-trips', () => {
    expect(parseTags(tagsToString(['fire', 'safety']))).toEqual(['fire', 'safety']);
  });

  it('handles nothing at all', () => {
    expect(parseTags('')).toEqual([]);
    expect(tagsToString([])).toBe('');
  });
});

describe('stripHtml', () => {
  it('reduces a rich body to readable text for a preview', () => {
    expect(stripHtml('<p>The <strong>notice</strong> was served.</p>'))
      .toBe('The notice was served.');
  });

  it('is empty for nothing', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});
