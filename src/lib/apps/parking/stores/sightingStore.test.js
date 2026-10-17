// Unauthorised parking records (migration 245): what the store writes, what
// reaches the audit log, and the order a delete runs in.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [], audit: [], uploadFails: false, purgeFails: false,
}));
vi.mock('#lib/utils/api.js', () => ({ api: {
  getAll: async () => [],
  create: async (table, row) => { h.calls.push(['create', table, row]); return { id: 'sight-1-xxxx', seen_at: '2026-10-17T09:15:00Z', ...row }; },
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

beforeEach(() => { h.calls.length = 0; h.audit.length = 0; h.uploadFails = false; h.purgeFails = false; });

describe('sightingStore', () => {
  it('records the registration normalised, then the photo, and the audit line names no registration or note', async () => {
    const { photoError } = await sightingStore.record({ registration: 'xcvb 675', place: 'road', notes: ' blocking the gate ', photo: new Blob(['x']) });
    expect(photoError).toBe('');
    expect(h.calls[0]).toEqual(['create', 'parking_sightings', { registration: 'XCVB675', place: 'road', notes: 'blocking the gate', created_by: 'u1' }]);
    expect(h.calls[1]).toEqual(['upload', ['Unauthorised Parking']]);
    expect(h.calls[2]).toEqual(['attach', 'parking_sighting', 'sight-1-xxxx', 'https://drive/x']);
    const line = JSON.stringify(h.audit);
    expect(line).not.toMatch(/XCVB|675|gate/i);
  });

  it('a photo that cannot be uploaded keeps the record, and says so', async () => {
    h.uploadFails = true;
    const { sighting, photoError } = await sightingStore.record({ registration: 'AB12CDE', place: 'car_park', photo: new Blob(['x']) });
    expect(sighting.id).toBe('sight-1-xxxx');
    expect(photoError).toMatch(/no signal/);
  });

  it('refuses before writing anything when the place is missing', async () => {
    await expect(sightingStore.record({ registration: 'AB12CDE', place: '' })).rejects.toThrow(/where/);
    expect(h.calls).toEqual([]);
  });

  it('deletes the photo before the record, and keeps the record if the photo cannot go', async () => {
    await sightingStore.remove('s9');
    expect(h.calls.map((c) => c[0])).toEqual(['purge', 'delete']);
    h.calls.length = 0; h.purgeFails = true;
    await expect(sightingStore.remove('s9')).rejects.toThrow(/photo/);
    expect(h.calls.map((c) => c[0])).toEqual(['purge']);
  });
});
