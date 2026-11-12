import { describe, it, expect } from 'vitest';
import { cleanHeadings, layoutRows, fromRows, groupApps } from './appHeadings.js';

const app = (id) => ({ id, name: id });
const apps = ['home', 'inspection', 'building_assets', 'mor', 'golden_thread', 'parking'].map(app);
const headings = [
  { id: 'h1', title: 'Building apps', before: 'inspection' },
  { id: 'h2', title: 'BSA', before: 'mor' },
];

describe('cleanHeadings', () => {
  it('drops blank titles, missing apps and a second heading over one app', () => {
    expect(cleanHeadings([
      { id: 'a', title: '  ', before: 'x' },
      { id: 'b', title: 'One', before: '' },
      { id: 'c', title: 'Two', before: 'mor' },
      { id: 'd', title: 'Three', before: 'mor' },
    ])).toEqual([{ id: 'c', title: 'Two', before: 'mor' }]);
    expect(cleanHeadings(null)).toEqual([]);
  });
});

describe('layoutRows / fromRows', () => {
  it('round-trips the order and the headings', () => {
    const rows = layoutRows(apps, headings);
    expect(rows.map((r) => (r.kind === 'heading' ? `#${r.title}` : r.app.id))).toEqual(
      ['home', '#Building apps', 'inspection', 'building_assets', '#BSA', 'mor', 'golden_thread', 'parking']);
    expect(fromRows(rows)).toEqual({ order: apps.map((a) => a.id), headings, dropped: 0 });
  });

  it('a heading moved down sits above the next app', () => {
    const rows = layoutRows(apps, headings);
    // move "BSA" down one (swap with mor)
    const i = rows.findIndex((r) => r.kind === 'heading' && r.title === 'BSA');
    [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]];
    expect(fromRows(rows).headings[1]).toEqual({ id: 'h2', title: 'BSA', before: 'golden_thread' });
  });

  it('drops a heading with nothing under it, and counts it', () => {
    const rows = [...layoutRows(apps, headings), { kind: 'heading', id: 'h3', title: 'End' }];
    expect(fromRows(rows).dropped).toBe(1);
    const stacked = [{ kind: 'app', app: app('home') }, { kind: 'heading', id: 'x', title: 'X' },
      { kind: 'heading', id: 'y', title: 'Y' }, { kind: 'app', app: app('mor') }];
    expect(fromRows(stacked)).toEqual({ order: ['home', 'mor'], headings: [{ id: 'y', title: 'Y', before: 'mor' }], dropped: 1 });
  });

  it('keeps a heading whose app has gone at the end of the list', () => {
    const rows = layoutRows(apps.filter((a) => a.id !== 'mor'), headings);
    expect(rows.at(-1)).toEqual({ kind: 'heading', id: 'h2', title: 'BSA' });
  });
});

describe('groupApps', () => {
  const order = apps.map((a) => a.id);
  it('puts each app under its heading, apps above the first heading first', () => {
    const g = groupApps(apps.slice(1), order, headings);
    expect(g.map((x) => [x.title, x.apps.map((a) => a.id)])).toEqual([
      ['Building apps', ['inspection', 'building_assets']],
      ['BSA', ['mor', 'golden_thread', 'parking']],
    ]);
  });

  it('keeps the heading when the person cannot see the app it sits above', () => {
    const seen = apps.filter((a) => a.id !== 'mor');
    const g = groupApps(seen, order, headings);
    expect(g.find((x) => x.title === 'BSA').apps.map((a) => a.id)).toEqual(['golden_thread', 'parking']);
  });

  it('leaves out a heading with none of the person’s apps under it', () => {
    const seen = ['home', 'parking'].map(app);
    const g = groupApps(seen, order, headings);
    expect(g.map((x) => x.title)).toEqual([null, 'BSA']);   // no Building apps
    expect(groupApps([app('home')], order, [{ id: 'h1', title: 'Building apps', before: 'inspection' }]))
      .toEqual([{ id: null, title: null, apps: [app('home')] }]);
  });

  it('with no headings, one untitled group in the order given', () => {
    expect(groupApps(apps, order, [])).toEqual([{ id: null, title: null, apps }]);
    expect(groupApps([], order, [])).toEqual([]);
  });

  it('an app added since the order was saved goes at the end', () => {
    const g = groupApps([...apps, app('guides')], order, headings);
    expect(g.at(-1)).toEqual({ id: '_new', title: null, apps: [app('guides')] });
  });
});
