import { describe, it, expect } from 'vitest';
import { allTargets, selectGuides, wrapText, layoutGuidebook, PAGE } from './guidebook.js';

const g = (o) => ({ status: 'published', title: 'T', category_key: null, targets: [], ...o });
const measure = (t, px) => t.length * px * 0.5;

describe('targets', () => {
  it('lists the targets of published guides only, once each, with counts', () => {
    const r = allTargets([
      g({ targets: ['Weekend cleaner', 'holiday cleaner'] }),
      g({ targets: ['weekend  cleaner '] }),
      g({ status: 'draft', targets: ['draft only'] }),
    ]);
    expect(r).toEqual([{ target: 'holiday cleaner', count: 1 }, { target: 'Weekend cleaner', count: 2 }]);
  });

  it('selects guides carrying ANY chosen target, ignoring case and spacing', () => {
    const guides = [g({ title: 'B', targets: ['weekend cleaner'] }), g({ title: 'A', targets: ['holiday cleaner'] }),
      g({ title: 'C', targets: ['other'] }), g({ title: 'D', status: 'retired', targets: ['weekend cleaner'] })];
    expect(selectGuides(guides, ['Weekend  Cleaner', 'holiday cleaner']).map((x) => x.title)).toEqual(['A', 'B']);
  });

  it('chooses nothing when nothing is chosen (never the whole library by accident)', () => {
    expect(selectGuides([g({ targets: ['x'] })], [])).toEqual([]);
    expect(selectGuides([g({ targets: ['x'] })], ['  '])).toEqual([]);
  });

  it('orders by category order, then title', () => {
    const guides = [g({ title: 'Z', category_key: 'a', targets: ['t'] }), g({ title: 'B', category_key: 'b', targets: ['t'] }),
      g({ title: 'A', category_key: 'b', targets: ['t'] })];
    expect(selectGuides(guides, ['t'], ['b', 'a']).map((x) => x.title)).toEqual(['A', 'B', 'Z']);
  });
});

describe('wrapText', () => {
  it('wraps on words and keeps paragraph breaks', () => {
    const lines = wrapText('one two three four\n\nfive', 10, false, 100, measure);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines).toContain('');
    for (const l of lines) expect(measure(l, 10)).toBeLessThanOrEqual(100 + 40);
  });
});

const book = (n, steps) => Array.from({ length: n }, (_, i) => ({
  title: `Guide ${i + 1}`, summary: 's', minutes: 5, youNeed: 'gloves',
  steps: steps ?? [{ kind: 'step', title: 'Do it', body: 'Short text', photos: [] }],
}));
const opts = { title: 'Guidebook', targets: ['weekend cleaner'], generated: '30 Oct 2026', measure, photoSize: () => ({ w: 800, h: 600 }) };

describe('layoutGuidebook', () => {
  it('starts with a cover that lists every guide with its start page, and each guide begins a new page', () => {
    const pages = layoutGuidebook(book(3), opts);
    const cover = pages[0].ops.filter((o) => o.type === 'text').map((o) => o.text);
    expect(cover).toEqual(expect.arrayContaining(['Guide 1', 'Guide 2', 'Guide 3', '2', '3', '4']));
    expect(pages).toHaveLength(4);
  });

  it('puts a footer with the page number on every page', () => {
    const pages = layoutGuidebook(book(2), opts);
    pages.forEach((p, i) => expect(p.ops.some((o) => o.type === 'text' && o.text === `Guidebook · page ${i + 1} of ${pages.length}`)).toBe(true));
  });

  it('never draws below the bottom margin, and keeps a step whole by moving it to the next page', () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ kind: 'step', title: `S${i}`, body: 'word '.repeat(80), photos: [{ url: 'a' }, { url: 'b' }] }));
    const pages = layoutGuidebook(book(1, steps), opts);
    expect(pages.length).toBeGreaterThan(3);
    for (const p of pages) for (const o of p.ops) {
      if (o.type === 'image') expect(o.y + o.h).toBeLessThanOrEqual(PAGE.h - PAGE.margin - PAGE.footer);
    }
    // every step title appears exactly once
    const titles = pages.flatMap((p) => p.ops.filter((o) => o.type === 'text').map((o) => o.text));
    for (let i = 0; i < 12; i++) expect(titles.filter((t) => t === `${i + 1}. S${i}`)).toHaveLength(1);
  });

  it('labels a non-ordinary step in words, not colour alone', () => {
    const pages = layoutGuidebook(book(1, [{ kind: 'stop', title: 'Jammed', body: 'Call the office', photos: [] }]), opts);
    expect(pages.flatMap((p) => p.ops).some((o) => o.type === 'text' && /STOP/.test(o.text))).toBe(true);
  });

  it('skips a photo whose size is unknown rather than failing the book', () => {
    const pages = layoutGuidebook(book(1, [{ kind: 'step', title: 'x', body: 'y', photos: [{ url: 'missing' }] }]),
      { ...opts, photoSize: () => null });
    expect(pages.flatMap((p) => p.ops).some((o) => o.type === 'image')).toBe(false);
  });

  it('a long contents list runs to extra pages and every guide is still listed', () => {
    const pages = layoutGuidebook(book(40), opts);
    const listed = pages.flatMap((p) => p.ops.filter((o) => o.type === 'text').map((o) => o.text));
    for (let i = 1; i <= 40; i++) expect(listed).toContain(`Guide ${i}`);
  });
});
