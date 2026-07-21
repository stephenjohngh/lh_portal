// src/lib/apps/inspection/utils/offlineQueue.test.js
//
// Exercises the offline outbox against an in-memory handle that mimics the
// IndexedDB semantics offlineQueue depends on: an autoincrement in-line key for
// `ops` (the generated seq is written onto the stored record), keyPath keys for
// `photos`/`readcache`, add() rejecting a duplicate key, and value cloning so a
// caller mutating a returned object can't reach into the store. Same contract as
// the real IdbHandle from $lib/utils/idb.js, so these tests characterise
// behaviour the browser store must also honour.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue, enqueueInspectionSave, listOps, listUnsyncedOps, setOpStatus,
  deleteOp, dropSession, pruneDone,
  putPhoto, getPhoto, deletePhoto, listPhotosFor, markPhotoUploaded,
  writeCache, readCache, summarizeOps,
  STORE_OPS, STORE_PHOTOS, STORE_CACHE, OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE,
} from './offlineQueue.js';

// -- In-memory IdbHandle stub --------------------------------------------------

function memHandle() {
  const stores = { [STORE_OPS]: new Map(), [STORE_PHOTOS]: new Map(), [STORE_CACHE]: new Map() };
  const cfg = {
    [STORE_OPS]:    { keyPath: 'seq',     auto: true },
    [STORE_PHOTOS]: { keyPath: 'photoId', auto: false },
    [STORE_CACHE]:  { keyPath: 'key',     auto: false },
  };
  let seq = 0;
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    add: async (store, value) => {
      const c = cfg[store];
      let v = value;
      if (c.auto && v[c.keyPath] == null) v = { ...v, [c.keyPath]: ++seq };
      const k = v[c.keyPath];
      if (stores[store].has(k)) throw new Error('ConstraintError: key exists');
      stores[store].set(k, clone(v));
      return k;
    },
    put: async (store, value) => {
      const k = value[cfg[store].keyPath];
      stores[store].set(k, clone(value));
      return k;
    },
    get:    async (store, key) => clone(stores[store].get(key)),
    getAll: async (store)      => [...stores[store].values()].map(clone),
    count:  async (store)      => stores[store].size,
    delete: async (store, key) => { stores[store].delete(key); },
    clear:  async (store)      => { stores[store].clear(); },
    close:  () => {},
  };
}

let h;
beforeEach(() => { h = memHandle(); });

// -- Ops -----------------------------------------------------------------------

describe('enqueue / listOps', () => {
  it('assigns an incrementing seq and defaults status/attempts', async () => {
    const a = await enqueue(h, { type: 'session_create', payload: { row: { id: 's1' } } });
    const b = await enqueue(h, { type: 'session_complete', sessionId: 's1', payload: {} });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(a.status).toBe(OP_PENDING);
    expect(a.attempts).toBe(0);
    expect(a.lastError).toBeNull();
    expect(typeof a.createdAt).toBe('number');
  });

  it('lists ops oldest-first regardless of insertion quirks', async () => {
    await enqueue(h, { type: 'a' });
    await enqueue(h, { type: 'b' });
    await enqueue(h, { type: 'c' });
    expect((await listOps(h)).map(o => o.type)).toEqual(['a', 'b', 'c']);
  });
});

describe('enqueueInspectionSave coalescing', () => {
  const save = (id, extra = {}) => ({
    row: { id, walk_session_id: 'sess', inspection_result: 'ok', ...extra },
    isUpdate: false, purgeInspectionId: null, photoIds: [], statusPatch: { status: 'ok' },
  });

  it('replaces a pending op for the same inspection in place (same seq)', async () => {
    const first  = await enqueueInspectionSave(h, save('i1', { inspection_result: 'ok' }));
    const second = await enqueueInspectionSave(h, save('i1', { inspection_result: 'failed' }));
    expect(second.seq).toBe(first.seq);            // coalesced, not appended
    const ops = await listOps(h);
    expect(ops).toHaveLength(1);
    expect(ops[0].payload.row.inspection_result).toBe('failed');
    expect(ops[0].status).toBe(OP_PENDING);
  });

  it('re-coalesces an errored op and resets it to pending with attempts 0', async () => {
    const first = await enqueueInspectionSave(h, save('i1'));
    await setOpStatus(h, first.seq, OP_SYNCING);   // attempts → 1
    await setOpStatus(h, first.seq, OP_ERROR, 'boom');
    const again = await enqueueInspectionSave(h, save('i1', { inspection_result: 'problem' }));
    expect(again.seq).toBe(first.seq);
    expect(again.status).toBe(OP_PENDING);
    expect(again.attempts).toBe(0);
    expect(again.lastError).toBeNull();
  });

  it('does NOT coalesce onto an op that is mid-flight (syncing) — appends a fresh op', async () => {
    const first = await enqueueInspectionSave(h, save('i1'));
    await setOpStatus(h, first.seq, OP_SYNCING);
    const second = await enqueueInspectionSave(h, save('i1', { inspection_result: 'failed' }));
    expect(second.seq).not.toBe(first.seq);
    expect(await listOps(h)).toHaveLength(2);
  });

  it('keeps separate ops for different inspection ids', async () => {
    await enqueueInspectionSave(h, save('i1'));
    await enqueueInspectionSave(h, save('i2'));
    expect(await listOps(h)).toHaveLength(2);
  });
});

describe('setOpStatus', () => {
  it("increments attempts only when entering 'syncing'", async () => {
    const op = await enqueue(h, { type: 'x' });
    const s1 = await setOpStatus(h, op.seq, OP_SYNCING);
    expect(s1.attempts).toBe(1);
    const e1 = await setOpStatus(h, op.seq, OP_ERROR, 'net');
    expect(e1.attempts).toBe(1);           // error doesn't bump
    expect(e1.lastError).toBe('net');
    const s2 = await setOpStatus(h, op.seq, OP_SYNCING);
    expect(s2.attempts).toBe(2);
    const d = await setOpStatus(h, op.seq, OP_DONE);
    expect(d.attempts).toBe(2);
    expect(d.lastError).toBeNull();
  });

  it('returns null for a missing op', async () => {
    expect(await setOpStatus(h, 999, OP_DONE)).toBeNull();
  });
});

describe('listUnsyncedOps / pruneDone / deleteOp', () => {
  it('excludes done ops and prunes them', async () => {
    const a = await enqueue(h, { type: 'a' });
    const b = await enqueue(h, { type: 'b' });
    await setOpStatus(h, a.seq, OP_DONE);
    expect((await listUnsyncedOps(h)).map(o => o.type)).toEqual(['b']);
    await pruneDone(h);
    expect((await listOps(h)).map(o => o.type)).toEqual(['b']);
    await deleteOp(h, b.seq);
    expect(await listOps(h)).toHaveLength(0);
  });
});

describe('dropSession', () => {
  it('removes every op for a session plus its photos, matching by sessionId or the session row id', async () => {
    await putPhoto(h, { photoId: 'p1', inspectionId: 'i1', blob: new Blob(['x']), filename: 'a.jpg', folderPath: [] });
    // session_create carries the session id as payload.row.id
    await enqueue(h, { type: 'session_create', sessionId: null, payload: { row: { id: 'sess' } } });
    await enqueueInspectionSave(h, {
      row: { id: 'i1', walk_session_id: 'sess', inspection_result: 'ok' },
      isUpdate: false, purgeInspectionId: null, photoIds: ['p1'], statusPatch: null,
    });
    await enqueue(h, { type: 'session_complete', sessionId: 'sess', payload: { sessionId: 'sess' } });
    // unrelated session survives
    await enqueue(h, { type: 'session_create', payload: { row: { id: 'other' } } });

    await dropSession(h, 'sess');

    const ops = await listOps(h);
    expect(ops).toHaveLength(1);
    expect(ops[0].payload.row.id).toBe('other');
    expect(await getPhoto(h, 'p1')).toBeUndefined();
  });
});

// -- Photos --------------------------------------------------------------------

describe('photos', () => {
  it('stores, lists by inspection, marks uploaded, and deletes', async () => {
    await putPhoto(h, { photoId: 'p1', inspectionId: 'i1', blob: new Blob(['a']), filename: '1.jpg', folderPath: ['Inspections'] });
    await putPhoto(h, { photoId: 'p2', inspectionId: 'i1', blob: new Blob(['b']), filename: '2.jpg', folderPath: ['Inspections'] });
    await putPhoto(h, { photoId: 'p3', inspectionId: 'i2', blob: new Blob(['c']), filename: '3.jpg', folderPath: ['Inspections'] });

    const p1 = await getPhoto(h, 'p1');
    expect(p1.uploaded).toBe(false);
    expect(p1.url).toBeNull();

    expect((await listPhotosFor(h, 'i1')).map(p => p.photoId).sort()).toEqual(['p1', 'p2']);

    await markPhotoUploaded(h, 'p1', 'https://drive/xyz');
    const after = await getPhoto(h, 'p1');
    expect(after.uploaded).toBe(true);
    expect(after.url).toBe('https://drive/xyz');

    await deletePhoto(h, 'p2');
    expect((await listPhotosFor(h, 'i1')).map(p => p.photoId)).toEqual(['p1']);
  });

  it('markPhotoUploaded on a missing photo returns null', async () => {
    expect(await markPhotoUploaded(h, 'nope', 'u')).toBeNull();
  });
});

// -- Read cache ----------------------------------------------------------------

describe('read cache', () => {
  it('round-trips a payload and reports age', async () => {
    await writeCache(h, 'load', { floors: [{ id: 'f1' }], components: [] });
    const c = await readCache(h, 'load');
    expect(c.data.floors[0].id).toBe('f1');
    expect(c.ageMs).toBeGreaterThanOrEqual(0);
  });

  it('returns null for a missing key', async () => {
    expect(await readCache(h, 'nope')).toBeNull();
  });

  it('overwrites on a second write', async () => {
    await writeCache(h, 'load', { v: 1 });
    await writeCache(h, 'load', { v: 2 });
    expect((await readCache(h, 'load')).data.v).toBe(2);
  });
});

// -- Pure summary --------------------------------------------------------------

describe('summarizeOps', () => {
  it('counts by status and totals the unsynced', () => {
    const ops = [
      { status: OP_PENDING }, { status: OP_PENDING },
      { status: OP_SYNCING }, { status: OP_ERROR }, { status: OP_DONE },
    ];
    expect(summarizeOps(ops)).toEqual({
      pending: 2, syncing: 1, error: 1, done: 1, unsynced: 4, total: 5,
    });
  });

  it('handles an empty list', () => {
    expect(summarizeOps([])).toEqual({ pending: 0, syncing: 0, error: 0, done: 0, unsynced: 0, total: 0 });
  });
});
