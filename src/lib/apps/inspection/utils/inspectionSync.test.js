// src/lib/apps/inspection/utils/inspectionSync.test.js
//
// syncOne is the per-op server work, deps-injected. These tests pin: the exact
// calls + ORDER for each op type, idempotency on replay (running twice makes the
// same calls with no extra branching), and the transient-vs-permanent error split
// that the runner keys its retry/skip decision on.

import { describe, it, expect, vi } from 'vitest';
import { syncOne, classifyError } from './inspectionSync.js';

function makeDeps() {
  return {
    upsertInspection:  vi.fn(() => Promise.resolve()),
    upsertSession:     vi.fn(() => Promise.resolve()),
    completeSession:   vi.fn(() => Promise.resolve()),
    purgeAttachments:  vi.fn(() => Promise.resolve()),
    addAttachments:    vi.fn(() => Promise.resolve()),
    applyStatusPatch:  vi.fn(() => Promise.resolve()),
    getPhoto:          vi.fn(() => Promise.resolve(null)),
    uploadPhoto:       vi.fn(() => Promise.resolve('https://drive/uploaded.jpg')),
    markPhotoUploaded: vi.fn(() => Promise.resolve()),
  };
}

const PAYLOAD = {
  row: { id: 'i1', component_id: 'c1', inspected_by: 'u1', inspection_result: 'failed' },
  photoUrls: ['https://drive/p.jpg'],
  statusPatch: { status: 'failed', last_inspection_id: 'i1', updated_by: 'u1' },
};

describe('syncOne — inspection_save', () => {
  it('upserts the inspection, purges then adds attachments, applies the status patch, in that order', async () => {
    const deps = makeDeps();
    const order = [];
    for (const k of Object.keys(deps)) deps[k].mockImplementation(() => { order.push(k); return Promise.resolve(); });

    const res = await syncOne({ type: 'inspection_save', payload: PAYLOAD }, deps);

    expect(res).toEqual({ ok: true });
    expect(deps.upsertInspection).toHaveBeenCalledWith(PAYLOAD.row);
    expect(deps.purgeAttachments).toHaveBeenCalledWith('component_inspection', 'i1');
    expect(deps.addAttachments).toHaveBeenCalledWith('component_inspection', 'i1', ['https://drive/p.jpg'], 'u1');
    expect(deps.applyStatusPatch).toHaveBeenCalledWith('c1', PAYLOAD.statusPatch);
    expect(order).toEqual(['upsertInspection', 'purgeAttachments', 'addAttachments', 'applyStatusPatch']);
  });

  it('is idempotent on replay — running twice repeats the same idempotent calls', async () => {
    const deps = makeDeps();
    await syncOne({ type: 'inspection_save', payload: PAYLOAD }, deps);
    await syncOne({ type: 'inspection_save', payload: PAYLOAD }, deps);
    expect(deps.upsertInspection).toHaveBeenCalledTimes(2); // upsert-by-id → safe
    expect(deps.purgeAttachments).toHaveBeenCalledTimes(2); // purge-then-add → converges
    expect(deps.addAttachments).toHaveBeenCalledTimes(2);
  });

  it('skips the status write when there is no patch', async () => {
    const deps = makeDeps();
    await syncOne({ type: 'inspection_save', payload: { ...PAYLOAD, statusPatch: null } }, deps);
    expect(deps.applyStatusPatch).not.toHaveBeenCalled();
  });

  it('a network error (no .code) is transient — the runner will retry', async () => {
    const deps = makeDeps();
    deps.upsertInspection.mockRejectedValueOnce(new Error('Failed to fetch'));
    expect(await syncOne({ type: 'inspection_save', payload: PAYLOAD }, deps))
      .toEqual({ ok: false, permanent: false, error: 'Failed to fetch' });
  });

  it('a PostgREST rejection (.code set) is permanent — the runner will skip it', async () => {
    const deps = makeDeps();
    deps.upsertInspection.mockRejectedValueOnce(Object.assign(new Error('violates check constraint'), { code: '23514' }));
    expect(await syncOne({ type: 'inspection_save', payload: PAYLOAD }, deps))
      .toEqual({ ok: false, permanent: true, error: 'violates check constraint' });
  });

  it('a mid-op failure (attachments) still classifies correctly', async () => {
    const deps = makeDeps();
    deps.addAttachments.mockRejectedValueOnce(new Error('offline'));
    const res = await syncOne({ type: 'inspection_save', payload: PAYLOAD }, deps);
    expect(res.ok).toBe(false);
    expect(res.permanent).toBe(false);
    expect(deps.applyStatusPatch).not.toHaveBeenCalled(); // aborted before the status write
  });
});

describe('syncOne — queued photo blobs', () => {
  const withPhotos = {
    row: { id: 'i1', component_id: 'c1', inspected_by: 'u1' },
    photoUrls: ['https://drive/already.jpg'],   // pre-uploaded (e.g. inline)
    photoIds: ['p1', 'p2'],
    statusPatch: { status: 'ok', updated_by: 'u1' },
  };

  it('uploads each un-uploaded blob, marks it, and attaches ALL urls (pre-uploaded + resolved)', async () => {
    const deps = makeDeps();
    deps.getPhoto.mockImplementation((pid) => Promise.resolve(
      { photoId: pid, blob: new Blob([pid]), filename: `${pid}.jpg`, folderPath: ['Inspections'], uploaded: false, url: null }
    ));
    deps.uploadPhoto.mockImplementation((_blob, { filename }) => Promise.resolve(`https://drive/${filename}`));

    const res = await syncOne({ type: 'inspection_save', payload: withPhotos }, deps);
    expect(res).toEqual({ ok: true });
    expect(deps.uploadPhoto).toHaveBeenCalledTimes(2);
    expect(deps.markPhotoUploaded).toHaveBeenCalledWith('p1', 'https://drive/p1.jpg');
    expect(deps.markPhotoUploaded).toHaveBeenCalledWith('p2', 'https://drive/p2.jpg');
    expect(deps.addAttachments).toHaveBeenCalledWith('component_inspection', 'i1',
      ['https://drive/already.jpg', 'https://drive/p1.jpg', 'https://drive/p2.jpg'], 'u1');
  });

  it('skips re-uploading a photo already uploaded on a previous attempt (idempotent replay)', async () => {
    const deps = makeDeps();
    deps.getPhoto.mockImplementation((pid) => Promise.resolve(
      pid === 'p1'
        ? { photoId: 'p1', uploaded: true, url: 'https://drive/p1.jpg' }              // done last time
        : { photoId: 'p2', blob: new Blob(['p2']), filename: 'p2.jpg', folderPath: [], uploaded: false, url: null }
    ));
    deps.uploadPhoto.mockResolvedValue('https://drive/p2.jpg');

    await syncOne({ type: 'inspection_save', payload: withPhotos }, deps);
    expect(deps.uploadPhoto).toHaveBeenCalledTimes(1);   // only p2
    expect(deps.addAttachments).toHaveBeenCalledWith('component_inspection', 'i1',
      ['https://drive/already.jpg', 'https://drive/p1.jpg', 'https://drive/p2.jpg'], 'u1');
  });

  it('skips a photo that was coalesced away (getPhoto returns nothing)', async () => {
    const deps = makeDeps();
    deps.getPhoto.mockResolvedValue(null);
    await syncOne({ type: 'inspection_save', payload: withPhotos }, deps);
    expect(deps.uploadPhoto).not.toHaveBeenCalled();
    expect(deps.addAttachments).toHaveBeenCalledWith('component_inspection', 'i1', ['https://drive/already.jpg'], 'u1');
  });

  it('a photo upload failure is transient — the whole op retries later', async () => {
    const deps = makeDeps();
    deps.getPhoto.mockResolvedValue({ photoId: 'p1', blob: new Blob(['p1']), filename: 'p1.jpg', folderPath: [], uploaded: false, url: null });
    deps.uploadPhoto.mockRejectedValueOnce(new Error('Failed to fetch'));
    const res = await syncOne({ type: 'inspection_save', payload: { ...withPhotos, photoIds: ['p1'] } }, deps);
    expect(res).toEqual({ ok: false, permanent: false, error: 'Failed to fetch' });
    expect(deps.addAttachments).not.toHaveBeenCalled();
  });
});

describe('syncOne — session ops', () => {
  it('session_create upserts the session row', async () => {
    const deps = makeDeps();
    expect(await syncOne({ type: 'session_create', payload: { row: { id: 's1' } } }, deps)).toEqual({ ok: true });
    expect(deps.upsertSession).toHaveBeenCalledWith({ id: 's1' });
  });

  it('session_complete updates the session with its fields', async () => {
    const deps = makeDeps();
    await syncOne({ type: 'session_complete', payload: { sessionId: 's1', fields: { status: 'closed', inspected_components_count: 3 } } }, deps);
    expect(deps.completeSession).toHaveBeenCalledWith('s1', { status: 'closed', inspected_components_count: 3 });
  });

  it('an unknown op type is a permanent error (never wedges the queue)', async () => {
    expect(await syncOne({ type: 'nope', payload: {} }, makeDeps()))
      .toEqual({ ok: false, permanent: true, error: 'Unknown op type: nope' });
  });
});

describe('classifyError', () => {
  it('permanent when the error carries a .code', () => {
    expect(classifyError(Object.assign(new Error('x'), { code: '23503' })))
      .toEqual({ ok: false, permanent: true, error: 'x' });
  });
  it('transient when there is no code (network/transport)', () => {
    expect(classifyError(new Error('offline'))).toEqual({ ok: false, permanent: false, error: 'offline' });
  });
  it('handles a non-Error throwable', () => {
    expect(classifyError('boom')).toEqual({ ok: false, permanent: false, error: 'boom' });
  });
});
