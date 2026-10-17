// The public parking application, server side (migration 247).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: /** @type {any[]} */ ([]), rpcResult: /** @type {any} */ ({ data: 'PKR-2026-000007', error: null }),
  workflow: /** @type {any} */ ({ data: { id: 'w1' }, error: null }) }));

vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'k' }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  rpc: async (fn, args) => { h.rpc.push([fn, args]); return h.rpcResult; },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => h.workflow }) }) }),
}) }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/server/identity.js', () => ({ getIdentity: async () => ({
  building: { name: 'Lonsdale House' }, organisation: { name: 'Acme RTM Ltd' } }) }));

const { submitApplication, applicationStatus, applyFormContext } = await import('./parkingApply.js');
const good = { holder_type: 'leaseholder', display_name: 'Pat Smith', email: 'pat@example.com', wanted_size: 'Car', agreed: true };

beforeEach(() => { h.rpc.length = 0; h.rpcResult = { data: 'PKR-2026-000007', error: null }; h.workflow = { data: { id: 'w1' }, error: null }; });

describe('the public parking application, server side', () => {
  it('the form shows the privacy notice in force, with this building’s names, and whether applications are open', async () => {
    const c = await applyFormContext();
    expect(c.privacyNotice).toMatch(/^Acme RTM Ltd will use the details you give here .* at Lonsdale House/);
    expect(c.open).toBe(true);
    h.workflow = { data: null, error: null };
    expect((await applyFormContext()).open).toBe(false);
  });

  it('checks the form again and saves nothing when it is wrong', async () => {
    await expect(submitApplication({ ...good, agreed: false })).rejects.toMatchObject({ status: 400, fields: { agreed: expect.any(String) } });
    expect(h.rpc).toEqual([]);
  });

  it('saves the trimmed answers with the SERVER’s privacy notice, not the page’s, and returns the reference and a code', async () => {
    const out = await submitApplication({ ...good, privacy_notice_text: 'something the page made up', website: '' });
    const [fn, args] = h.rpc[0];
    expect(fn).toBe('parking_request_submit');
    expect(args.p.privacy_notice_text).toMatch(/^Acme RTM Ltd will use/);
    expect(args.p).toMatchObject({ display_name: 'Pat Smith', email: 'pat@example.com', wanted_size: 'Car' });
    expect(args.p).not.toHaveProperty('agreed');
    expect(args.p_code).toMatch(/^[A-Z0-9]{6}$/);
    expect(out.reference).toBe('PKR-2026-000007');
    expect(out.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  it('says applications are not open when there is no workflow yet', async () => {
    h.rpcResult = { data: null, error: { message: 'Applications are not open yet.' } };
    await expect(submitApplication(good)).rejects.toMatchObject({ status: 409, message: 'Applications are not open yet.' });
  });

  it('the status needs a well-formed reference and code before it asks the database, and gives back only the stage', async () => {
    expect(await applicationStatus('rubbish', 'ABC123')).toBeNull();
    expect(await applicationStatus('PKR-2026-000007', '')).toBeNull();
    expect(h.rpc).toEqual([]);
    h.rpcResult = { data: { reference: 'PKR-2026-000007', stage: 'Being checked', kind: 'open', received: 'r', updated: 'u' }, error: null };
    const s = await applicationStatus('PKR-2026-000007', 'r7p-qk2');
    expect(h.rpc[0]).toEqual(['parking_request_status', { p_reference: 'PKR-2026-000007', p_code: 'R7PQK2' }]);
    expect(s).toEqual({ reference: 'PKR-2026-000007', stage: 'Being checked', finished: false, received: 'r', updated: 'u' });
  });
});
