// src/lib/apps/inspection/utils/syncRunner.test.js
//
// ⭐ The offline walk, RUN (2026-10-04, PROJECT_STATUS §6ccc item 7).
//
// The parts had tests — the outbox on an in-memory store, one op's sync on
// mocks — and the loop that joins them had none: nothing had ever taken a walk
// recorded offline through syncRunner to a server. The replay bug that deleted
// the photos it was about to reuse (§6jj) was found by reading, not running.
//
// These run whole walks through the REAL runner, outbox and per-op sync. Only
// the edges are fake: IndexedDB is an in-memory store with its semantics
// (auto-increment keys, values cloned in and out), and the server is a fake
// that behaves like the real one where it matters — an inspection needs its
// session (the foreign key), a close of a session that is not there updates no
// row and says nothing (PostgREST does exactly that), photos become files, and
// a file is deleted only when the attachment set stops naming it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STORE_OPS, STORE_PHOTOS, STORE_CACHE, enqueue, enqueueInspectionSave, putPhoto,
  listOps, setOpStatus, OP_SYNCING, OP_ERROR,
} from './offlineQueue.js';

// ── The edges ────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({ handle: /** @type {any} */ (null) }));

vi.mock('./offlineQueue.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, openQueue: async () => h.handle, isOfflineAvailable: () => true };
});
vi.mock('$lib/stores/online.js', async () => {
  const { writable } = await import('svelte/store');
  return { online: writable(true) };
});
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('./inspectionSyncDeps.js', () => ({ makeSyncDeps: () => { throw new Error('the test injects its deps'); } }));

/** IndexedDB's semantics, in memory: auto-increment key on ops, clone in and out. */
function memHandle() {
  const stores = { [STORE_OPS]: new Map(), [STORE_PHOTOS]: new Map(), [STORE_CACHE]: new Map() };
  const keyPath = { [STORE_OPS]: 'seq', [STORE_PHOTOS]: 'photoId', [STORE_CACHE]: 'key' };
  let seq = 0;
  const clone = (/** @type {any} */ v) => (v === undefined ? undefined : structuredClone(v));
  return {
    add: async (/** @type {string} */ s, /** @type {any} */ v) => {
      const val = s === STORE_OPS && v.seq == null ? { ...v, seq: ++seq } : v;
      const k = val[keyPath[s]];
      if (stores[s].has(k)) throw new Error('ConstraintError');
      stores[s].set(k, clone(val)); return k;
    },
    put:    async (/** @type {string} */ s, /** @type {any} */ v) => { stores[s].set(v[keyPath[s]], clone(v)); return v[keyPath[s]]; },
    get:    async (/** @type {string} */ s, /** @type {any} */ k) => clone(stores[s].get(k)),
    getAll: async (/** @type {string} */ s) => [...stores[s].values()].map(clone),
    count:  async (/** @type {string} */ s) => stores[s].size,
    delete: async (/** @type {string} */ s, /** @type {any} */ k) => { stores[s].delete(k); },
    clear:  async (/** @type {string} */ s) => { stores[s].clear(); },
    close:  () => {},
  };
}

/** A server that behaves like the real one where the sync depends on it. */
function fakeServer() {
  const db = {
    sessions:    new Map(),
    inspections: new Map(),
    attachments: new Map(),          // inspectionId → [{ url, provider }]
    files:       new Set(),          // what storage holds
    status:      new Map(),          // componentId → status
  };
  const seen = { uploads: 0, deleted: /** @type {string[]} */ ([]) };
  /** @type {{ step: string, kind: 'network'|'reject' }[]} */
  const faults = [];
  /** Make `step` fail once, as a dropped connection or a database refusal. */
  const failOnce = (/** @type {string} */ step, /** @type {'network'|'reject'} */ kind) => faults.push({ step, kind });
  const check = (/** @type {string} */ step) => {
    const i = faults.findIndex((f) => f.step === step);
    if (i < 0) return;
    const [f] = faults.splice(i, 1);
    if (f.kind === 'network') throw new TypeError('Failed to fetch');
    throw Object.assign(new Error('new row violates check constraint'), { code: '23514' });
  };
  const deps = {
    upsertSession: async (/** @type {any} */ row) => { check('upsertSession'); db.sessions.set(row.id, { ...db.sessions.get(row.id), ...row }); },
    upsertInspection: async (/** @type {any} */ row) => {
      check('upsertInspection');
      if (!db.sessions.has(row.walk_session_id)) {
        throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
      }
      db.inspections.set(row.id, { ...row });
    },
    uploadPhoto: async (/** @type {any} */ _blob, /** @type {any} */ { filename }) => {
      check('uploadPhoto');
      seen.uploads++;
      const url = `https://drive.example/${filename}#${seen.uploads}`;
      db.files.add(url);
      return { url, provider: 'google_drive' };
    },
    // The real setAttachments' rule: a file goes only when the set stops naming it.
    setAttachments: async (/** @type {string} */ _type, /** @type {string} */ id, /** @type {any[]} */ items) => {
      check('setAttachments');
      const desired = items.map((i) => (typeof i === 'string' ? { url: i, provider: null } : i));
      const want = new Set(desired.map((d) => d.url));
      for (const a of db.attachments.get(id) ?? []) {
        if (!want.has(a.url)) { db.files.delete(a.url); seen.deleted.push(a.url); }
      }
      db.attachments.set(id, desired);
    },
    applyStatusPatch: async (/** @type {string} */ cid, /** @type {any} */ patch) => { check('applyStatusPatch'); db.status.set(cid, patch.status); },
    // PostgREST: an update that matches no row succeeds and changes nothing.
    completeSession: async (/** @type {string} */ id, /** @type {any} */ fields) => {
      check('completeSession');
      if (db.sessions.has(id)) db.sessions.set(id, { ...db.sessions.get(id), ...fields });
    },
  };
  return { db, seen, deps, failOnce };
}

// ── Recording a walk, the way inspectionStore does ───────────────────────────

const SESSION = 'sess-1';
const startSession = (/** @type {any} */ handle) =>
  enqueue(handle, { type: 'session_create', sessionId: SESSION, payload: { row: { id: SESSION, status: 'open' } } });

/** @param {any} handle @param {string} inspId @param {string} componentId @param {string} result @param {string[]} [photoNames] */
async function record(handle, inspId, componentId, result, photoNames = []) {
  const payload = {
    row: { id: inspId, walk_session_id: SESSION, component_id: componentId, inspection_result: result, inspected_by: 'u1' },
    photoUrls: [], photoIds: /** @type {string[]} */ ([]), statusPatch: { status: result, updated_by: 'u1' },
  };
  for (const name of photoNames) {
    const photoId = `${inspId}-${name}`;
    await putPhoto(handle, { photoId, inspectionId: inspId, blob: new Blob([name]), filename: name, folderPath: ['Inspections'] });
    payload.photoIds.push(photoId);
  }
  await enqueueInspectionSave(handle, payload);
}

const closeSession = (/** @type {any} */ handle, /** @type {number} */ count) =>
  enqueue(handle, { type: 'session_complete', sessionId: SESSION,
    payload: { sessionId: SESSION, fields: { status: 'closed', inspected_components_count: count } } });

/** A fresh runner, as after a page load: module state reset, same IndexedDB. */
async function loadRunner() {
  vi.resetModules();
  const runner = await import('./syncRunner.js');
  const { online } = await import('$lib/stores/online.js');
  return { runner, online, start: async (/** @type {any} */ deps) => {
    // startSync kicks a drain, and another once the stale reset is done; let
    // both settle so a test's own kicks are the only ones in play.
    runner.startSync(deps);
    await new Promise((r) => setTimeout(r, 0));
    await runner.flush();
  } };
}

let server = fakeServer();
beforeEach(() => { h.handle = memHandle(); server = fakeServer(); });

// ── The walks ────────────────────────────────────────────────────────────────

describe('a walk recorded offline', () => {
  it('reaches the server whole on reconnect: session, inspections, photos, statuses, the close', async () => {
    const { runner, online } = await loadRunner();
    online.set(false);
    runner.startSync(server.deps);
    await startSession(h.handle);
    await record(h.handle, 'i1', 'c1', 'ok', ['a.jpg', 'b.jpg']);
    await record(h.handle, 'i2', 'c2', 'failed', ['c.jpg']);
    await record(h.handle, 'i3', 'c3', 'ok');
    await closeSession(h.handle, 3);
    await runner.flush();
    expect(server.db.sessions.size).toBe(0);              // nothing left while offline

    online.set(true);
    const left = await runner.flush();
    expect(left.unsynced).toBe(0);
    expect(server.db.sessions.get(SESSION)).toMatchObject({ status: 'closed', inspected_components_count: 3 });
    expect([...server.db.inspections.keys()].sort()).toEqual(['i1', 'i2', 'i3']);
    expect(server.db.attachments.get('i1')).toHaveLength(2);
    expect(server.db.attachments.get('i2')).toHaveLength(1);
    expect(server.db.status.get('c2')).toBe('failed');
    expect(server.seen.uploads).toBe(3);
    expect(server.seen.deleted).toEqual([]);
    expect(await listOps(h.handle)).toEqual([]);           // the outbox is empty
    expect(await h.handle.getAll(STORE_PHOTOS)).toEqual([]); // and the blobs freed
    runner.stopSync();
  });

  it('a re-inspect before it synced replaces the first, and its dropped photo is never uploaded', async () => {
    const { runner, online } = await loadRunner();
    online.set(false);
    runner.startSync(server.deps);
    await startSession(h.handle);
    await record(h.handle, 'i1', 'c1', 'failed', ['first.jpg']);
    await record(h.handle, 'i1', 'c1', 'ok', ['second.jpg']);
    online.set(true);
    await runner.flush();
    expect(server.db.inspections.get('i1').inspection_result).toBe('ok');
    expect(server.seen.uploads).toBe(1);
    expect(server.db.attachments.get('i1').map((/** @type {any} */ a) => a.url)).toEqual(['https://drive.example/second.jpg#1']);
    runner.stopSync();
  });
});

describe('a connection that drops mid-sync', () => {
  it('stops, keeps the rest in order, and finishes on reconnect without uploading a photo twice or deleting one', async () => {
    const { runner, start } = await loadRunner();
    await start(server.deps);
    await startSession(h.handle);
    await record(h.handle, 'i1', 'c1', 'ok', ['a.jpg', 'b.jpg']);
    await record(h.handle, 'i2', 'c2', 'ok');
    server.failOnce('setAttachments', 'network');          // both photos uploaded, then the line drops
    await runner.flush();
    expect(server.db.inspections.has('i2')).toBe(false);   // it stopped rather than skipping ahead
    expect(server.seen.uploads).toBe(2);

    await runner.flush();                                  // reconnect
    expect(server.seen.uploads).toBe(2);                   // not uploaded again
    expect(server.seen.deleted).toEqual([]);
    expect(server.db.attachments.get('i1')).toHaveLength(2);
    expect(server.db.inspections.has('i2')).toBe(true);
    expect(server.db.attachments.get('i1').every((/** @type {any} */ a) => server.db.files.has(a.url))).toBe(true);
    runner.stopSync();
  });

  it('a page reload mid-op leaves it "syncing"; the next start resets it and finishes the job', async () => {
    const first = await loadRunner();
    await first.start(server.deps);
    await startSession(h.handle);
    await record(h.handle, 'i1', 'c1', 'ok', ['a.jpg']);
    server.failOnce('setAttachments', 'network');
    await first.runner.flush();
    // The tab was closed mid-op: the op is left as it was when the page died.
    const op = (await listOps(h.handle)).find((o) => o.type === 'inspection_save');
    await setOpStatus(h.handle, op.seq, OP_SYNCING);
    first.runner.stopSync();

    const second = await loadRunner();
    second.runner.startSync(server.deps);
    await new Promise((r) => setTimeout(r, 0));            // startSync resets, then kicks
    const left = await second.runner.flush();
    expect(left.unsynced).toBe(0);
    expect(server.db.attachments.get('i1')).toHaveLength(1);
    expect(server.seen.uploads).toBe(1);
    expect(server.seen.deleted).toEqual([]);
    second.runner.stopSync();
  });
});

describe('a refusal from the database', () => {
  it('marks that one op and carries on with the rest; Retry sends it again', async () => {
    const { runner } = await loadRunner();
    runner.startSync(server.deps);
    await startSession(h.handle);
    await record(h.handle, 'i1', 'c1', 'ok');
    await record(h.handle, 'i2', 'c2', 'ok');
    server.failOnce('upsertInspection', 'reject');        // i1 refused (a CHECK)
    const left = await runner.flush();
    expect(left.error).toBe(1);
    expect(server.db.inspections.has('i2')).toBe(true);
    const errored = (await listOps(h.handle)).filter((o) => o.status === OP_ERROR);
    expect(errored.map((o) => o.payload.row.id)).toEqual(['i1']);

    await runner.retryErrors();
    await runner.flush();
    expect(server.db.inspections.has('i1')).toBe(true);
    expect((await runner.flush()).unsynced).toBe(0);
    runner.stopSync();
  });
});

describe('Finish, pressed while the last component is still syncing', () => {
  // ⛔ The fault this test found: flush() returned at once while another drain
  // was running — and recordInspection kicks one after every save — so the
  // count was taken before the last inspection reached the server.
  it('waits for that sync before it returns', async () => {
    const { runner } = await loadRunner();
    /** @type {() => void} */
    let release = () => {};
    const slow = { ...server.deps, uploadPhoto: async (/** @type {any} */ b, /** @type {any} */ o) => {
      await new Promise((r) => { release = () => r(undefined); });
      return server.deps.uploadPhoto(b, o);
    } };
    runner.startSync(slow);
    await startSession(h.handle);
    await record(h.handle, 'i1', 'c1', 'ok', ['last.jpg']);
    runner.kickSync();                                     // what recordInspection does
    await new Promise((r) => setTimeout(r, 0));            // the drain is now mid-upload

    let flushed = false;
    const finish = runner.flush().then(() => { flushed = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(flushed).toBe(false);                           // it must not return yet
    release();
    await finish;
    expect(server.db.inspections.has('i1')).toBe(true);    // the count would now include it
    runner.stopSync();
  });

  it('a save made during a drain is included before flush returns', async () => {
    const { runner } = await loadRunner();
    /** @type {() => void} */
    let release = () => {};
    const slow = { ...server.deps, upsertSession: async (/** @type {any} */ row) => {
      await new Promise((r) => { release = () => r(undefined); });
      return server.deps.upsertSession(row);
    } };
    runner.startSync(slow);
    await startSession(h.handle);
    runner.kickSync();
    await new Promise((r) => setTimeout(r, 0));
    await record(h.handle, 'i9', 'c9', 'ok');              // recorded while the drain is busy
    const finish = runner.flush();
    release();
    await finish;
    expect(server.db.inspections.has('i9')).toBe(true);
    runner.stopSync();
  });
});
