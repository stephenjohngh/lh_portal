import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ calls: /** @type {any[]} */ ([]), failFiles: false, steps: /** @type {any[]} */ ([]) }));

vi.mock('#lib/utils/api.js', () => ({
  api: {
    getAll: vi.fn(async (t, o) => { h.calls.push(['getAll', t, o]); return t === 'guide_steps' ? h.steps : []; }),
    get: vi.fn(async (t, o) => { h.calls.push(['get', t, o]); return h.steps.length ? [{ position: h.steps.length }] : []; }),
    getById: vi.fn(async (t, id) => ({ id, title: 'G', version: h.version ?? 0 })),
    count: vi.fn(async () => 0),
    create: vi.fn(async (t, d) => { h.calls.push(['create', t, d]); return { id: 'new', title: d.title ?? 'x', ...d }; }),
    createMany: vi.fn(async (t, d) => { h.calls.push(['createMany', t, d]); return []; }),
    update: vi.fn(async (t, id, d) => { h.calls.push(['update', t, id, d]); return { id, title: 'G', ...d }; }),
    delete: vi.fn(async (t, id) => { h.calls.push(['delete', t, id]); }),
    rpc: vi.fn(async (fn, p) => { h.calls.push(['rpc', fn, p]); return 3; }),
  },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
vi.mock('#lib/utils/currentUser.js', () => ({ requireUserId: async () => 'u1' }));
vi.mock('#lib/utils/imageCompression.js', () => ({ compressImage: async (f) => f }));
vi.mock('#lib/utils/mediaUpload.js', () => ({ uploadMedia: vi.fn(async () => ({ url: 'u', provider: 'drive', sizeBytes: 1, mimeType: 'image/jpeg' })) }));
vi.mock('#lib/utils/mediaAttachments.js', () => ({
  listAttachments: vi.fn(async () => []),
  addAttachments: vi.fn(async (...a) => { h.calls.push(['addAttachments', ...a]); }),
  purgeAttachments: vi.fn(async (...a) => { h.calls.push(['purge', ...a]); if (h.failFiles) throw new Error('file stuck'); }),
  deleteStorageObjects: vi.fn(async () => ({ deleted: 0, failed: h.failFiles ? 1 : 0 })),
}));

import { guidesStore } from './guidesStore.js';

beforeEach(() => { h.calls = []; h.failFiles = false; h.steps = []; h.version = 0; });
const names = () => h.calls.map((c) => c.slice(0, 2).join(':'));

describe('guidesStore authoring', () => {
  it('a new step goes at the end', async () => {
    h.steps = [{ id: 'a' }, { id: 'b' }];
    await guidesStore.addStep('g1');
    expect(h.calls.find((c) => c[0] === 'create')[2]).toMatchObject({ guide_id: 'g1', position: 3, kind: 'step' });
  });

  it('reordering is one atomic call with the exact list', async () => {
    await guidesStore.reorderSteps('g1', ['b', 'a']);
    expect(h.calls[0]).toEqual(['rpc', 'guide_reorder_steps', { p_guide: 'g1', p_ids: ['b', 'a'] }]);
  });

  it('deleting a step deletes its photo files first, and keeps the step if one cannot go', async () => {
    await guidesStore.deleteStep('s1');
    expect(names()).toEqual(['purge:guide_step', 'delete:guide_steps']);
    h.calls = []; h.failFiles = true;
    await expect(guidesStore.deleteStep('s1')).rejects.toThrow();
    expect(names()).not.toContain('delete:guide_steps');
  });

  it('a published guide cannot be deleted', async () => {
    h.version = 2;
    await expect(guidesStore.deleteGuide('g1')).rejects.toThrow(/retire/i);
    expect(names()).not.toContain('delete:guides');
  });

  it('a draft guide is deleted after its steps\' photos', async () => {
    h.steps = [{ id: 's1' }];
    await guidesStore.deleteGuide('g1');
    const n = names();
    expect(n.indexOf('purge:guide_step')).toBeLessThan(n.indexOf('delete:guides'));
  });

  it('refuses a fifth photo without uploading', async () => {
    await expect(guidesStore.addPhoto({ id: 'g', title: 'T' }, 's1', new Blob(['x']), 4)).rejects.toThrow(/at most 4/);
    expect(names()).not.toContain('addAttachments:guide_step');
  });

  it('a photo is recorded against the step and touches the guide', async () => {
    await guidesStore.addPhoto({ id: 'g', title: 'T' }, 's1', new Blob(['x']), 0);
    expect(names()).toContain('addAttachments:guide_step');
    expect(names()).toContain('update:guides');
  });

  it('publish calls the database function', async () => {
    expect(await guidesStore.publish('g1')).toBe(3);
    expect(h.calls[0]).toEqual(['rpc', 'guide_publish', { p_guide: 'g1' }]);
  });

  it('default categories are added only when there are none', async () => {
    await guidesStore.ensureDefaultCategories();
    expect(names()).toContain('createMany:guide_categories');
  });
});
