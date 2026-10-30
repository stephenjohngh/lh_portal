import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tables: /** @type {Record<string, any[]>} */ ({}), failOn: /** @type {string|null} */ (null) }));

vi.mock('#lib/utils/api.js', () => ({
  api: {
    get: vi.fn(async (table, o) => (h.tables[table] ?? []).filter((r) => Object.entries(o?.filters ?? {}).every(([k, v]) => r[k] === v))),
    getAllIn: vi.fn(async (table, column, values) => {
      if (h.failOn === table) throw new Error('read failed');
      return (h.tables[table] ?? []).filter((r) => values.map(String).includes(String(r[column])));
    }),
  },
}));

const o = vi.hoisted(() => ({ saved: /** @type {Record<string, any>} */ ({}), photos: /** @type {Record<string, string>} */ ({}), cachedUrls: /** @type {string[]} */ ([]) }));
vi.mock('./utils/guideOffline.js', () => ({
  saveBundle: async (k, b) => { o.saved[k] = b; },
  loadBundle: async (k) => o.saved[k] ?? null,
  cachePhotos: async (urls) => { o.cachedUrls = urls; return { saved: urls.length, missed: 0 }; },
  cachedPhotoUrl: async (u) => o.photos[u] ?? null,
}));

import { guidesFor, guidesForWalk, prepareGuidesForWalk, failHelpForWalk } from './public.js';

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

beforeEach(() => { h.tables = {}; h.failOn = null; o.saved = {}; o.photos = {}; o.cachedUrls = []; });

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

describe('guides for a walk with no signal', () => {
  const tables = () => ({ guide_links: [link({ obligation_id: 'ob' }), link({ guide_id: 'g2', obligation_id: 'ob', component_type_id: 'ty' })],
    guides: [guide(), guide({ id: 'g2', title: 'Type guide' })], guide_versions: [version(), version({ guide_id: 'g2' })] });

  it('reads live when it can, and says it is not a saved copy', async () => {
    h.tables = tables();
    const r = await guidesForWalk({ obligation_id: 'ob' });
    expect(r.fromCache).toBe(false);
    expect(r.guides.map((g) => g.guideId)).toEqual(['g1']);
  });

  it('"get ready" saves everything the walk could show, and its photos', async () => {
    h.tables = tables();
    const r = await prepareGuidesForWalk({ obligationId: 'ob', typeIds: ['ty'], componentIds: ['c1'] });
    expect(r).toEqual({ guides: 2, photos: 1, photosMissed: 0 });
    expect(o.cachedUrls).toEqual(['u1']);
    expect(o.saved['walk:ob'].guides).toHaveLength(2);
  });

  it('with the live read failing, answers from the saved copy — per component, from one saved walk', async () => {
    h.tables = tables();
    await prepareGuidesForWalk({ obligationId: 'ob', typeIds: ['ty'], componentIds: ['c1'] });
    h.failOn = 'guide_links';
    const walk = await guidesForWalk({ obligation_id: 'ob' });
    expect(walk.fromCache).toBe(true);
    expect(walk.guides.map((g) => g.guideId)).toEqual(['g1']);
    const comp = await guidesForWalk({ obligation_id: 'ob', component_type_id: 'ty', component_id: 'c1' });
    expect(comp.guides.map((g) => g.guideId).sort()).toEqual(['g1', 'g2']);
  });

  it('uses a photo held on the device when it is there', async () => {
    h.tables = tables();
    await prepareGuidesForWalk({ obligationId: 'ob' });
    o.photos.u1 = 'blob:local';
    h.failOn = 'guide_links';
    const r = await guidesForWalk({ obligation_id: 'ob' });
    expect(r.guides[0].steps[0].photos[0].url).toBe('blob:local');
  });

  it('with no signal AND nothing saved, it fails — so the screen can say so', async () => {
    h.failOn = 'guide_links';
    await expect(guidesForWalk({ obligation_id: 'ob' })).rejects.toThrow('read failed');
  });
});

describe('check-level guides (S4)', () => {
  const t = () => ({
    guide_links: [link({ obligation_id: 'ob' }), link({ guide_id: 'g2', obligation_id: 'ob', component_type_id: 'ty', type_attribute_id: 'at' })],
    guides: [guide(), guide({ id: 'g2', title: 'Check guide' })], guide_versions: [version(), version({ guide_id: 'g2' })],
  });
  const ctx = { obligation_id: 'ob', component_type_id: 'ty', type_attribute_id: 'at' };

  it('a check-level bar shows only guides that name the check, not the walk-level ones', async () => {
    h.tables = t();
    expect((await guidesForWalk(ctx, { requireTarget: 'type_attribute_id' })).guides.map((g) => g.guideId)).toEqual(['g2']);
    expect((await guidesForWalk(ctx)).guides.map((g) => g.guideId).sort()).toEqual(['g1', 'g2']);
  });

  it('a component-level screen (no check in its context) never gets a check-linked guide', async () => {
    h.tables = t();
    expect((await guidesForWalk({ obligation_id: 'ob', component_type_id: 'ty' })).guides.map((g) => g.guideId)).toEqual(['g1']);
  });

  it('answers a check from the saved walk copy without another read', async () => {
    h.tables = t();
    await prepareGuidesForWalk({ obligationId: 'ob', typeIds: ['ty'], attributeIds: ['at'] });
    h.failOn = 'guide_links';                         // a live read would now fail
    const r = await guidesForWalk(ctx, { requireTarget: 'type_attribute_id' });
    expect(r.guides.map((g) => g.guideId)).toEqual(['g2']);
    expect(r.fromCache).toBe(false);
  });
});

describe('if a check fails (S-fail, migration 273)', () => {
  const tables = () => ({
    guide_links: [link({ obligation_id: 'ob' }), link({ guide_id: 'g2', obligation_id: 'ob', component_type_id: 'ty', show_on: 'fail' })],
    guides: [guide(), guide({ id: 'g2', title: 'If it fails' })], guide_versions: [version(), version({ guide_id: 'g2' })],
    portal_settings: [{ key: 'guides_fail_contact', value: { name: 'The office', phone: '020 7946 0000', hours: '8-6', notes: '' } }],
  });
  const ctx = { obligation_id: 'ob', component_type_id: 'ty' };

  it('an ordinary bar never offers an "if it fails" guide, and the failure help offers only those', async () => {
    h.tables = tables();
    expect((await guidesForWalk(ctx)).guides.map((g) => g.guideId)).toEqual(['g1']);
    expect((await failHelpForWalk(ctx)).guides.map((g) => g.guideId)).toEqual(['g2']);
  });

  it('returns who to call, tidied', async () => {
    h.tables = tables();
    expect((await failHelpForWalk(ctx)).contact).toEqual({ name: 'The office', phone: '020 7946 0000', hours: '8-6', notes: '' });
  });

  it('nobody set up is null, not an empty box', async () => {
    h.tables = { ...tables(), portal_settings: [{ key: 'guides_fail_contact', value: { name: ' ', phone: '' } }] };
    expect((await failHelpForWalk(ctx)).contact).toBeNull();
  });

  it('with no signal, answers from the saved walk — guides and the number', async () => {
    h.tables = tables();
    await prepareGuidesForWalk({ obligationId: 'ob', typeIds: ['ty'] });
    h.failOn = 'guide_links';
    const r = await failHelpForWalk(ctx);
    expect(r.fromCache).toBe(true);
    expect(r.guides.map((g) => g.guideId)).toEqual(['g2']);
    expect(r.contact?.phone).toBe('020 7946 0000');
  });

  it('with no signal and nothing saved it fails, so the screen cannot read it as "nothing to do"', async () => {
    h.failOn = 'guide_links';
    await expect(failHelpForWalk(ctx)).rejects.toThrow();
  });
});
