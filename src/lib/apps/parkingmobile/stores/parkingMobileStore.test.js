// Parking (M) sends each lookup's audit line from the shared outbox. A line the
// server refuses is skipped; anything that might succeed later waits.
import { describe, it, expect, vi } from 'vitest';

vi.mock('#lib/apps/parking/stores/parkingStore.js', () => ({ parkingStore: { subscribe: () => () => {}, load: vi.fn() } }));
vi.mock('#lib/apps/parking/stores/permitStore.js', () => ({ permitStore: { subscribe: () => () => {}, load: vi.fn() } }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/supabaseClient.js', () => ({ supabase: {} }));
vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', {}));

const { syncAuditOp, DB_NAME } = await import('./parkingMobileStore.js');
const { SESSION_EXPIRED } = await import('#lib/utils/request.js');
const { PERSONAL_DATABASES } = await import('#lib/offline/wipe.js');

const op = { type: 'lookup_audit', payload: { eventType: 'view', afterData: { query: 'AB12' } } };
const failing = (/** @type {any} */ e) => ({ post: async () => { throw e; } });

describe('sending a queued lookup audit line', () => {
  it('posts the line as queued', async () => {
    const post = vi.fn(async () => ({}));
    expect(await syncAuditOp(op, { post })).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith(op.payload);
  });

  it('waits for a reconnect on no network, an expired session, a timeout or a rate limit', async () => {
    for (const e of [new TypeError('Failed to fetch'), new Error(SESSION_EXPIRED),
      Object.assign(new Error('x'), { status: 408 }), Object.assign(new Error('x'), { status: 429 }),
      Object.assign(new Error('x'), { status: 503 })]) {
      expect((await syncAuditOp(op, failing(e))).permanent).toBe(false);
    }
  });

  it('skips a line the server refuses, so it cannot hold up the rest', async () => {
    expect(await syncAuditOp(op, failing(Object.assign(new Error('bad'), { status: 400 }))))
      .toMatchObject({ ok: false, permanent: true });
    expect((await syncAuditOp({ type: 'other' }, { post: vi.fn() })).permanent).toBe(true);
  });

  it('keeps its copy in a database that logout deletes', () => {
    expect(PERSONAL_DATABASES).toContain(DB_NAME);
  });
});
