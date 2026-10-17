// Parking's offline queue (parkingQueue.js): audit lines and unauthorised-
// parking sightings wait on the phone and are sent when there is a signal.
// The whole-send tests run the real queue and sending loop on an in-memory
// phone database, against a fake server that can drop the connection.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { memIdb } from '#lib/testing/memIdb.test-helper.js';

const h = vi.hoisted(() => ({ db: /** @type {any} */ (null) }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/utils/idb.js', () => ({ isIdbAvailable: () => true, openDB: async () => h.db }));
vi.mock('#lib/stores/online.js', async () => {
  const { writable } = await import('svelte/store');
  return { online: writable(false) };
});

const q = await import('./parkingQueue.js');
const { online } = await import('#lib/stores/online.js');
const { SESSION_EXPIRED } = await import('#lib/utils/sessionExpired.js');
const { PERSONAL_DATABASES } = await import('#lib/offline/wipe.js');
const { STORE_PHOTOS } = await import('#lib/offline/photoStore.js');

const audit = { type: 'lookup_audit', payload: { eventType: 'view', afterData: { query: 'AB12' } } };
const failing = (/** @type {any} */ e) => ({ post: async () => { throw e; } });

describe('sending a queued audit line', () => {
  it('posts the line as queued', async () => {
    const post = vi.fn(async () => ({}));
    expect(await q.syncAuditOp(audit, { post })).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith(audit.payload);
  });

  it('waits for a reconnect on no network, an expired session, a timeout or a rate limit', async () => {
    for (const e of [new TypeError('Failed to fetch'), new Error(SESSION_EXPIRED),
      Object.assign(new Error('x'), { status: 408 }), Object.assign(new Error('x'), { status: 429 }),
      Object.assign(new Error('x'), { status: 503 })]) {
      expect((await q.syncAuditOp(audit, failing(e))).permanent).toBe(false);
    }
  });

  it('skips a line the server refuses, and an op of a kind it does not know, so neither holds up the rest', async () => {
    expect(await q.syncAuditOp(audit, failing(Object.assign(new Error('bad'), { status: 400 }))))
      .toMatchObject({ ok: false, permanent: true });
    expect((await q.syncParkingOp({ type: 'other' }, { post: vi.fn() })).permanent).toBe(true);
  });

  it('keeps its queue in a database that logout deletes', () => {
    expect(PERSONAL_DATABASES).toContain(q.DB_NAME);
  });
});

/** A server the sighting sync talks to: records, uploads, attachments. */
function fakeServer() {
  const s = {
    rows: new Map(), uploads: /** @type {string[]} */ ([]), attachments: /** @type {any[]} */ ([]), audit: /** @type {any[]} */ ([]),
    dropUpload: 0,           // fail this many uploads with no network
    refuseInsert: false,
  };
  const deps = {
    post: async (/** @type {any} */ body) => { s.audit.push(body); },
    insertSighting: async (/** @type {any} */ row) => {
      if (s.refuseInsert) throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });
      if (s.rows.has(row.id)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      s.rows.set(row.id, row);
    },
    listAttachments: async (/** @type {string} */ _t, /** @type {string} */ id) => s.attachments.filter((a) => a.id === id),
    addAttachments: async (/** @type {string} */ _t, /** @type {string} */ id, /** @type {any[]} */ items) => { s.attachments.push({ id, url: items[0].url }); },
    uploadMedia: async (/** @type {Blob} */ _b, /** @type {any} */ o) => {
      if (s.dropUpload > 0) { s.dropUpload -= 1; throw new TypeError('Failed to fetch'); }
      const url = `https://drive/${o.filename}`;
      s.uploads.push(url);
      return { url, provider: 'google_drive', sizeBytes: 3 };
    },
  };
  return { s, deps };
}

const row = (/** @type {string} */ id) => ({ id, registration: 'XCVB675', place: 'road', notes: 'on the corner',
  seen_at: '2026-10-17T22:15:00.000Z', created_by: 'u1' });
const photo = { blob: new Blob(['jpg']), filename: 'sighting_x.jpg', folderPath: ['Unauthorised Parking'] };

describe('a sighting recorded with no signal', () => {
  /** @type {ReturnType<typeof fakeServer>} */
  let server;
  beforeEach(async () => {
    h.db = memIdb();
    online.set(false);
    server = fakeServer();
    q.stopSync();
    q.startSync(server.deps);
  });

  it('waits on the phone, then reaches the server whole on reconnect — record, photo, attachment — and the phone copy goes', async () => {
    await q.queueSighting(row('s1'), photo);
    await q.flush();
    expect(server.s.rows.size).toBe(0);
    const waiting = get(q.syncState).items.find((i) => i.sighting);
    expect(waiting).toMatchObject({ sighting: { id: 's1', registration: 'XCVB675' }, hasPhoto: true });

    online.set(true);
    await q.flush();
    expect([...server.s.rows.keys()]).toEqual(['s1']);
    expect(server.s.rows.get('s1').seen_at).toBe('2026-10-17T22:15:00.000Z');   // the phone's time
    expect(server.s.uploads).toHaveLength(1);
    expect(server.s.attachments).toEqual([{ id: 's1', url: server.s.uploads[0] }]);
    expect(await h.db.getAll(STORE_PHOTOS)).toEqual([]);
    expect(get(q.syncState).items).toEqual([]);
  });

  it('a connection dropped during the photo: the next try neither records it twice nor uploads twice', async () => {
    online.set(true);
    server.s.dropUpload = 1;
    await q.queueSighting(row('s2'), photo);
    await q.flush();
    expect(server.s.rows.size).toBe(1);                 // the record went…
    expect(server.s.attachments).toEqual([]);           // …the photo did not
    expect(get(q.syncState).pending).toBe(1);           // and it waits

    await q.flush();                                    // the retry
    expect(server.s.rows.size).toBe(1);
    expect(server.s.uploads).toHaveLength(1);
    expect(server.s.attachments).toHaveLength(1);
  });

  it('an upload that finished before the drop is attached without uploading again', async () => {
    online.set(true);
    // The upload succeeds, then attaching fails as the signal goes.
    const realAdd = server.deps.addAttachments;
    let failOnce = true;
    server.deps.addAttachments = async (...a) => { if (failOnce) { failOnce = false; throw new TypeError('Failed to fetch'); } return realAdd(...a); };
    await q.queueSighting(row('s3'), photo);
    await q.flush();
    await q.flush();
    expect(server.s.uploads).toHaveLength(1);
    expect(server.s.attachments).toHaveLength(1);
  });

  it('a record the server refuses is kept on the phone as "could not be sent", and Retry sends it', async () => {
    online.set(true);
    server.s.refuseInsert = true;
    await q.queueSighting(row('s4'), null);
    await q.flush();
    expect(get(q.syncState).error).toBe(1);
    expect(get(q.syncState).items[0]).toMatchObject({ status: 'error', sighting: { id: 's4' } });
    server.s.refuseInsert = false;
    await q.retryErrors();
    await q.flush();
    expect([...server.s.rows.keys()]).toEqual(['s4']);
  });

  it('a sighting’s audit line waits in the same queue and is sent with it', async () => {
    await q.queueAudit({ eventType: 'create', targetType: 'parking_sighting', targetId: 's5' });
    await q.queueSighting(row('s5'), null);
    online.set(true);
    await q.flush();
    expect(server.s.audit).toEqual([{ eventType: 'create', targetType: 'parking_sighting', targetId: 's5' }]);
    expect(server.s.rows.has('s5')).toBe(true);
  });

  it('tells the sightings list when one has been sent', async () => {
    const seen = /** @type {string[]} */ ([]);
    const off = q.onSynced((op) => { if (op.type === 'sighting') seen.push(op.payload.row.id); });
    online.set(true);
    await q.queueSighting(row('s6'), null);
    await q.flush();
    off();
    expect(seen).toEqual(['s6']);
  });
});
