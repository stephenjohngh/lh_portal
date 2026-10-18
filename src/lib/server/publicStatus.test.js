// The public status answer, server side (migration 261): it asks the
// database only with a well-formed reference and code, and passes back the
// step's public words and nothing else.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: /** @type {any[]} */ ([]), result: /** @type {any} */ ({ data: null, error: null }) }));
vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'k' }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: async (fn, args) => { h.rpc.push([fn, args]); return h.result; } }) }));

const { publicStatus } = await import('./publicStatus.js');
beforeEach(() => { h.rpc.length = 0; h.result = { data: null, error: null }; });

describe('publicStatus', () => {
  it('does not ask the database with a malformed reference or code', async () => {
    expect(await publicStatus('rubbish', 'ABC234')).toBeNull();
    expect(await publicStatus('CMP-2026-000001', '')).toBeNull();
    expect(h.rpc).toEqual([]);
  });

  it('asks with the reference and the code as the public may type them, and passes back only the answer', async () => {
    h.result = { data: { reference: 'CMP-2026-000001', process: 'Building safety complaint', stage: 'Being dealt with',
      kind: 'open', received: 'r', updated: 'u', extra: 'never passed on' }, error: null };
    const s = await publicStatus(' cmp-2026-000001 ', 'r7p-qk2');
    expect(h.rpc[0]).toEqual(['workflow_public_status', { p_reference: 'CMP-2026-000001', p_code: 'R7PQK2' }]);
    expect(s).toEqual({ reference: 'CMP-2026-000001', process: 'Building safety complaint', stage: 'Being dealt with',
      finished: false, received: 'r', updated: 'u' });
  });

  it('nothing found, a wrong code and a process switched off all read the same: null', async () => {
    expect(await publicStatus('CMP-2026-000001', 'ABC234')).toBeNull();
  });
});
