// src/lib/apps/planner/utils/categories.test.js

import { describe, it, expect } from 'vitest';
import {
  PALETTE, swatch, categoryOf, pickable, slugify, uniqueSlug, SYSTEM_SLUGS,
  marksByDate, markStyle,
} from './categories.js';

const CATEGORIES = [
  { slug: 'meeting',     name: 'Meeting',     colour: 'indigo', system: true,  position: 3 },
  { slug: 'compliance',  name: 'Compliance',  colour: 'red',    system: true,  position: 1 },
  { slug: 'gardening',   name: 'Gardening',   colour: 'lime',   system: false, position: 9 },
  { slug: 'old',         name: 'Old thing',   colour: 'slate',  system: false, position: 5, archived: true },
];

describe('PALETTE', () => {
  it('contains no teal, emerald or purple', () => {
    // The portal's accent is teal, and tailwind remaps purple-* onto it. A
    // category in the accent colour reads as interface rather than as data.
    const keys = PALETTE.map(p => p.key);
    expect(keys).not.toContain('teal');
    expect(keys).not.toContain('emerald');
    expect(keys).not.toContain('purple');
    expect(keys).not.toContain('green');
  });

  it('gives every swatch a dot and a chip class', () => {
    expect(PALETTE.every(p => p.dot.startsWith('bg-') && p.chip.includes('border-'))).toBe(true);
  });

  it('has no duplicate keys', () => {
    expect(new Set(PALETTE.map(p => p.key)).size).toBe(PALETTE.length);
  });
});

describe('swatch', () => {
  it('finds a colour', () => {
    expect(swatch('red').dot).toBe('bg-red-500');
  });

  it('falls back to grey rather than to nothing', () => {
    // A missing swatch would render a dot with no background — invisible, and
    // indistinguishable from an empty day.
    expect(swatch('chartreuse').dot).toBe('bg-slate-400');
    expect(swatch(null).dot).toBe('bg-slate-400');
  });
});

describe('categoryOf', () => {
  it('resolves a category to its name and colour', () => {
    const category = categoryOf('meeting', CATEGORIES);
    expect(category.name).toBe('Meeting');
    expect(category.dot).toBe('bg-indigo-400');
  });

  it('names an event with no category at all', () => {
    expect(categoryOf(null, CATEGORIES).name).toBe('Uncategorised');
  });

  it('still renders a category that has been removed', () => {
    // A visible loose end beats a silent one: the event shows in grey under its
    // own slug rather than vanishing from the year.
    const gone = categoryOf('was-deleted', CATEGORIES);
    expect(gone.missing).toBe(true);
    expect(gone.name).toBe('was-deleted');
    expect(gone.dot).toBe('bg-slate-400');
  });

  it('works with no categories loaded yet', () => {
    expect(categoryOf('meeting', []).missing).toBe(true);
    expect(categoryOf('meeting').missing).toBe(true);
  });
});

describe('pickable', () => {
  it('leaves out archived categories', () => {
    expect(pickable(CATEGORIES).map(c => c.slug)).not.toContain('old');
  });

  it('orders by position, then by name', () => {
    expect(pickable(CATEGORIES).map(c => c.slug))
      .toEqual(['compliance', 'meeting', 'gardening']);
  });

  it('survives nothing', () => {
    expect(pickable()).toEqual([]);
  });
});

describe('slugify', () => {
  it('makes a slug from a name', () => {
    expect(slugify('Fire safety')).toBe('fire-safety');
    expect(slugify('  Bins & recycling! ')).toBe('bins-recycling');
  });

  it('never returns leading or trailing dashes', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('- hello -')).toBe('hello');
  });
});

describe('uniqueSlug', () => {
  it('takes the plain slug when it is free', () => {
    expect(uniqueSlug('Gardening', [])).toBe('gardening');
  });

  it('does not collide with one already taken', () => {
    // Two categories both called "Meeting" would otherwise file their events
    // into each other.
    expect(uniqueSlug('Meeting', CATEGORIES)).toBe('meeting-2');
  });

  it('always returns something usable', () => {
    expect(uniqueSlug('!!!', [])).toBe('category');
  });
});

describe('SYSTEM_SLUGS', () => {
  it('names exactly what the aggregation files foreign items under', () => {
    // utils/linked.js maps maintenance jobs, meetings, actions and GT reviews
    // onto these, so they have to exist — which is why the database refuses to
    // delete them.
    expect(SYSTEM_SLUGS).toEqual(['compliance', 'maintenance', 'meeting', 'other']);
  });
});

describe('day marks', () => {
  // A bank holiday is not something anybody DOES: no owner, never ticked, never
  // overdue. It is a property of the day, so it is stored against the date and
  // drawn as background rather than as content.

  it('gives every swatch a wash for shading a whole cell', () => {
    // A dot at full strength is a mark; a cell at full strength is a shout, and
    // the date printed on it stops being readable.
    expect(PALETTE.every(p => p.wash?.includes('/25'))).toBe(true);
  });

  it('keys marks by date for the grids to read', () => {
    const map = marksByDate([
      { date: '2026-12-25', label: 'Christmas Day', colour: 'red' },
      { date: '2026-12-26', label: 'Boxing Day', colour: 'red' },
    ]);
    expect(map.get('2026-12-25').label).toBe('Christmas Day');
    expect(map.has('2026-12-27')).toBe(false);
  });

  it('ignores a mark with no date', () => {
    expect(marksByDate([{ label: 'nowhere' }]).size).toBe(0);
    expect(marksByDate().size).toBe(0);
  });

  it('resolves a mark to a wash and a label', () => {
    const style = markStyle({ date: '2026-12-25', label: 'Christmas Day', colour: 'red' });
    expect(style.wash).toBe('bg-red-500/25');
    expect(style.label).toBe('Christmas Day');
  });

  it('is null for an unmarked day, so it can be tested as a condition', () => {
    expect(markStyle(null)).toBeNull();
    expect(markStyle(undefined)).toBeNull();
  });

  it('falls back to grey for a colour it does not know', () => {
    expect(markStyle({ colour: 'chartreuse', label: 'x' }).wash).toBe('bg-slate-500/25');
  });
});
