// src/lib/apps/inspection/utils/syncRunner.js
//
// The Inspection app's sync runner: the shared offline loop
// (`#lib/offline/syncRunner.js`) set up for walks. What is Inspection's own is
// here — photos bound to the queue for upload, a synced op's photos retired
// (image dropped, url kept), retired photos pruned at start-up, and each op's
// session and inspection ids in `syncState.items` for the per-component badge.
// The per-op work is inspectionSync.syncOne.

import { createSyncRunner } from '#lib/offline/syncRunner.js';
import {
  openQueue, isOfflineAvailable, getPhoto, markPhotoUploaded, retirePhoto, pruneRetiredPhotos,
} from './offlineQueue.js';
import { syncOne } from './inspectionSync.js';
import { makeSyncDeps } from './inspectionSyncDeps.js';

const runner = createSyncRunner({
  name: 'inspection',
  // Called through the module's own exports, so a test that mocks
  // ./offlineQueue.js reaches the runner too.
  openQueue: () => openQueue(),
  isOfflineAvailable: () => isOfflineAvailable(),
  syncOne,
  makeDeps: (handle, injected) => ({
    getPhoto:          (pid) => getPhoto(handle, pid),
    markPhotoUploaded: (pid, url, provider) => markPhotoUploaded(handle, pid, url, provider),
    ...(injected ?? makeSyncDeps()),
  }),
  // The blobs are on Drive and attached now: free the images, and keep what
  // each became, so a later re-inspect can remove one by name.
  afterDone: async (handle, op) => {
    for (const pid of (op.payload?.photoIds ?? [])) await retirePhoto(handle, pid);
  },
  onStart: (handle) => pruneRetiredPhotos(handle),
  itemOf: (o) => ({
    sessionId:    o.sessionId ?? o.payload?.row?.walk_session_id ?? null,
    inspectionId: o.type === 'inspection_save' ? (o.payload?.row?.id ?? null) : null,
  }),
});

export const { syncState, drain, kickSync, retryErrors, flush, startSync, stopSync } = runner;
