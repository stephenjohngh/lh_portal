// Unauthorised parking records (migrations 245/246): what the store writes,
// what reaches the audit log, and the order a delete runs in. Recording goes
// through Parking's offline queue (parkingQueue.js) where the phone can hold
// it; only where it cannot is it sent directly.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [], audit: [], queued: [], uploadFails: false, purgeFails: false, idb: true, synced: null,
}));
vi.mock('#lib/utils/idb.js', () => ({ isIdbAvailable: () => h.idb }));
vi.mock('./parkingQueue.js', () => ({
  SIGHTING_ENTITY: 'parking_sighting',
  queueSighting: async (row, photo) => { h.queued.push(['sighting', row, photo]); },
  queueAudit: async (payload) => { h.queued.push(['audit', payload]); },
  onSynced: (fn) => { h.synced = fn; return () => {}; },
}));
vi.mock('#lib/utils/api.js', () => ({ api: {
  getAll: async () => { h.calls.push(['getAll']); return []; },
  create: async (table, row) => { h.calls.push(['create', table, row]); return { ...row }; },
  delete: async (table, id) => { h.calls.push(['delete', table, id]); },
} }));
vi.mock('#lib/utils/mediaUpload.js', () => ({ uploadMedia: async (_b, o) => {
  h.calls.push(['upload', o.folderPath]); if (h.uploadFails) throw new Error('no signal'); return { url: 'https://drive/x', provider: 'google_drive', sizeBytes: 10 };
} }));
vi.mock('#lib/utils/mediaAttachments.js', () => ({
  listAttachments: async () => [],
  addAttachments: async (type, id, items) => { h.calls.push(['attach', type, id, items[0].url]); },
  purgeAttachments: async (type, ids) => { h.calls.push(['purge', type, ids]); if (h.purgeFails) throw new Error('could not delete the photo'); },
}));
vi.mock('#lib/utils/currentUser.js', () => ({ requireUserId: async () => 'u1' }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: (...a) => h.audit.push(a) }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { sightingStore } = await import('./sightingStore.js');

beforeEach(() => {
  h.calls.length = 0; h.audit.length = 0; h.queued.length = 0;
  h.uploadFails = false; h.purgeFails = false; h.idb = true;
});

describe('sightingStore — recording', () => {
  it('queues the record (id and time made on the phone, registration normalised) with its photo, and its audit line', async () => {
    const blob = new Blob(['x']);
    const { sighting, queued } = await sightingStore.record({ registration: 'xcvb 675', place: 'road', notes: ' blocking the gate ', photo: blob });
    expect(queued).toBe(true);
    const [[kind, row, photo], [kind2, audit]] = h.queued;
    expect(kind).toBe('sighting');
    expect(row).toMatchObject({ registration: 'XCVB675', place: 'road', notes: 'blocking the gate', created_by: 'u1' });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(row.seen_at)).toBeGreaterThan(0);
    expect(photo).toMatchObject({ blob, folderPath: ['Unauthorised Parking'] });
    expect(sighting.id).toBe(row.id);
    expect(kind2).toBe('audit');
    expect(audit).toMatchObject({ targetType: 'parking_sighting', targetId: row.id });
    expect(JSON.stringify(audit)).not.toMatch(/XCVB|675|gate/i);   // nothing personal
    expect(h.calls).toEqual([]);                                     // nothing sent directly
  });

  it('where the phone cannot hold it, sends it directly; a photo that cannot be uploaded keeps the record, and says so', async () => {
    h.idb = false; h.uploadFails = true;
    const { queued, photoError } = await sightingStore.record({ registration: 'AB12CDE', place: 'car_park', photo: new Blob(['x']) });
    expect(queued).toBe(false);
    expect(h.calls[0][0]).toBe('create');
    expect(photoError).toMatch(/no signal/);
    expect(JSON.stringify(h.audit)).not.toMatch(/AB12/);
  });

  it('refuses before keeping anything when the place is missing', async () => {
    await expect(sightingStore.record({ registration: 'AB12CDE', place: '' })).rejects.toThrow(/where/);
    expect(h.queued).toEqual([]);
  });

  it('reads the list again when a queued sighting has been sent — once the list has been read', async () => {
    await sightingStore.load();
    h.calls.length = 0;
    h.synced({ type: 'sighting' });
    await Promise.resolve();
    expect(h.calls).toEqual([['getAll']]);
  });
});

describe('sightingStore — deleting', () => {
  it('deletes the photo before the record, and keeps the record if the photo cannot go', async () => {
    await sightingStore.remove('s9');
    expect(h.calls.map((c) => c[0])).toEqual(['purge', 'delete']);
    h.calls.length = 0; h.purgeFails = true;
    await expect(sightingStore.remove('s9')).rejects.toThrow(/photo/);
    expect(h.calls.map((c) => c[0])).toEqual(['purge']);
  });
});
