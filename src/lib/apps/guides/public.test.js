import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tables: /** @type {Record<string, any[]>} */ ({}), failOn: /** @type {string|null} */ (null) }));

vi.mock('#lib/utils/api.js', () => ({
  api: {
    getAllIn: vi.fn(async (table, column, values) => {
      if (h.failOn === table) throw new Error('read failed');
      return (h.tables[table] ?? []).filter((r) => values.map(String).includes(String(r[column])));
    }),
  },
}));

import { guidesFor } from './public.js';

const guide = (o) => ({ id: 'g1', title: 'Testing a luminaire', status: 'published', version: 2, summary: 's', ...o });
const link = (o) => ({ id: `l-${Math.random()}`, guide_id: 'g1', step_ids: null, created_at: 'x', ...o });
const version = (o) => ({
  guide_id: 'g1', version: 2,
  snapshot: {
    you_need: 'a key', minutes: 5,
    steps: [
      { id: 's1', position: 1, kind: 'step', title: 'One', body: 'b1', photos: [{ id: 'p1', url: 'u1', filename: 'a.jpg' }] },
      { id: 's2', position: 2, kind: 'caution', title: 'Two', body: null, photos: [] },
    ],
  }, ...o,
});

beforeEach(() => { h.tables = {}; h.failOn = null; });

describe('guidesFor — what the walk is shown', () => {
  it('returns the matching guide with its steps from the latest published version', async () => {
    h.tables = { guide_links: [link({ obligation_id: 'ob' })], guides: [guide()], guide_versions: [version(), version({ version: 1, snapshot: { steps: [] } })] };
    const r = await guidesFor({ obligation_id: 'ob' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ guideId: 'g1', title: 'Testing a luminaire', version: 2, youNeed: 'a key', minutes: 5 });
    expect(r[0].steps.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(r[0].steps[0].photos).toEqual([{ id: 'p1', url: 'u1', filename: 'a.jpg' }]);
  });
  it('shows only the steps a link names', async () => {
    h.tables = { guide_links: [link({ obligation_id: 'ob', step_ids: ['s2'] })], guides: [guide()], guide_versions: [version()] };
    expect((await guidesFor({ obligation_id: 'ob' }))[0].steps.map((s) => s.id)).toEqual(['s2']);
  });
  it('needs every target the link sets (a type-level link does not show at the walk start)', async () => {
    h.tables = { guide_links: [link({ obligation_id: 'ob', component_type_id: 'ty' })], guides: [guide()], guide_versions: [version()] };
    expect(await guidesFor({ obligation_id: 'ob' })).toEqual([]);
    expect(await guidesFor({ obligation_id: 'ob', component_type_id: 'ty' })).toHaveLength(1);
  });
  it('a guide that is not published is silence, not an error', async () => {
    h.tables = { guide_links: [link({ obligation_id: 'ob' })], guides: [guide({ status: 'retired' })], guide_versions: [version()] };
    expect(await guidesFor({ obligation_id: 'ob' })).toEqual([]);
  });
  it('a guide with no frozen copy to show is silence', async () => {
    h.tables = { guide_links: [link({ obligation_id: 'ob' })], guides: [guide()], guide_versions: [] };
    expect(await guidesFor({ obligation_id: 'ob' })).toEqual([]);
  });
  it('nothing in the context means nothing to ask', async () => {
    expect(await guidesFor({})).toEqual([]);
    expect(await guidesFor({ obligation_id: null, space_id: '' })).toEqual([]);
  });
  it('orders the most specific guide first', async () => {
    h.tables = {
      guide_links: [link({ guide_id: 'g1', obligation_id: 'ob' }), link({ guide_id: 'g2', obligation_id: 'ob', component_type_id: 'ty' })],
      guides: [guide(), guide({ id: 'g2', title: 'B' })],
      guide_versions: [version(), version({ guide_id: 'g2' })],
    };
    expect((await guidesFor({ obligation_id: 'ob', component_type_id: 'ty' })).map((g) => g.guideId)).toEqual(['g2', 'g1']);
  });
  it('a failed read rejects, so the caller can say guides are unavailable rather than imply there are none', async () => {
    h.failOn = 'guide_links';
    h.tables = { guide_links: [link({ obligation_id: 'ob' })] };
    await expect(guidesFor({ obligation_id: 'ob' })).rejects.toThrow('read failed');
  });
});
