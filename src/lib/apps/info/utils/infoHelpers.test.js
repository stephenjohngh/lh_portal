// src/lib/apps/info/utils/infoHelpers.test.js
// Pure helpers behind the Info app's sidebar and note form.

import { describe, it, expect } from 'vitest';
import {
  sectionNotes, publishedNotes, publishedCount, archiveNotePatch, isPublished,
  parseTags, tagsToString, stripHtml,
} from './infoHelpers.js';

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

describe('publishedNotes', () => {
  const notes = [
    note({ id: 'a', visibility: 'internal' }),
    note({ id: 'b', visibility: 'public',     published_at: '2026-01-10T00:00:00Z' }),
    note({ id: 'c', visibility: 'registered', published_at: '2026-03-01T00:00:00Z' }),
  ];

  it('lists everything readable outside the Info app', () => {
    expect(publishedNotes(notes).map(n => n.id)).toEqual(['c', 'b']);
  });

  it('treats a note with no visibility as internal', () => {
    // The column default. An absent value must never read as published.
    expect(publishedNotes([note({ id: 'x', visibility: undefined })])).toEqual([]);
    expect(publishedNotes([note({ id: 'y', visibility: null })])).toEqual([]);
  });

  it('puts the most recently published first', () => {
    expect(publishedNotes(notes)[0].id).toBe('c');
  });

  it('falls back to updated_at when a note has no published_at', () => {
    const mixed = [
      note({ id: 'old', visibility: 'public', updated_at: '2026-01-01T00:00:00Z' }),
      note({ id: 'new', visibility: 'public', updated_at: '2026-06-01T00:00:00Z' }),
    ];
    expect(publishedNotes(mixed).map(n => n.id)).toEqual(['new', 'old']);
  });

  it('INCLUDES an archived note that is still published', () => {
    // The point of the view. Archiving hides a note from the working list; it
    // does not unpublish it, so an archived public note is still a live page on
    // the internet and must not disappear from the one place that would say so.
    const archived = [note({ id: 'z', visibility: 'public', status: 'archived' })];
    expect(publishedNotes(archived).map(n => n.id)).toEqual(['z']);
  });

  it('does not mutate or re-order the caller-s array', () => {
    const original = [...notes];
    publishedNotes(notes);
    expect(notes).toEqual(original);
  });

  it('counts the same set', () => {
    expect(publishedCount(notes)).toBe(2);
    expect(publishedCount([])).toBe(0);
    expect(publishedCount()).toBe(0);
  });
});

describe('archiveNotePatch', () => {
  it('archives an internal note and touches nothing else', () => {
    expect(archiveNotePatch(note({ visibility: 'internal' }), true))
      .toEqual({ status: 'archived' });
  });

  it('UNPUBLISHES a published note when it is archived', () => {
    // Archiving reads as "take this out of circulation". Leaving a live public
    // page behind means the portal and the internet disagree about what the
    // building has said — gone from the working list, still readable by a
    // resident.
    expect(archiveNotePatch(note({ visibility: 'public', published_at: '2026-01-01' }), true))
      .toEqual({ status: 'archived', visibility: 'internal', published_at: null });
  });

  it('unpublishes a registered-only note too', () => {
    expect(archiveNotePatch(note({ visibility: 'registered' }), true).visibility)
      .toBe('internal');
  });

  it('does NOT republish when a note is restored', () => {
    // Deliberately not symmetrical. Putting a page back on the internet is an
    // outward-facing act somebody has to choose, never a side effect of
    // un-hiding a note.
    expect(archiveNotePatch(note({ visibility: 'internal', status: 'archived' }), false))
      .toEqual({ status: 'active' });
  });

  it('leaves the slug alone, so re-publishing keeps the same address', () => {
    const patch = archiveNotePatch(note({ visibility: 'public', slug: 'fire-safety' }), true);
    expect(patch).not.toHaveProperty('slug');
  });

  it('treats an absent visibility as internal', () => {
    expect(archiveNotePatch(note({ visibility: undefined }), true))
      .toEqual({ status: 'archived' });
  });
});

describe('isPublished', () => {
  it('is false for internal, absent and null', () => {
    expect(isPublished(note({ visibility: 'internal' }))).toBe(false);
    expect(isPublished(note({ visibility: undefined }))).toBe(false);
    expect(isPublished(null)).toBe(false);
  });

  it('is true for anything readable outside the app', () => {
    expect(isPublished(note({ visibility: 'public' }))).toBe(true);
    expect(isPublished(note({ visibility: 'registered' }))).toBe(true);
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
