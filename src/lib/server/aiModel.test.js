// src/lib/server/aiModel.test.js
// The model in use is the admin's choice, checked against what Anthropic offers
// now — and a model refused as unknown is replaced within its family and the
// call retried ONCE, instead of every AI suggestion failing until someone edits
// code (§6ccc item 5, 2026-10-03).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  saved: /** @type {string|null} */ (null),
  offered: /** @type {any[]} */ ([]),
  listCalls: 0,
}));

vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'http://localhost' }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'key' }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.saved ? { value: h.saved } : null, error: null }) }) }) }),
  }),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    models = {
      list: () => { h.listCalls++; return (async function* () { for (const m of h.offered) yield m; })(); },
    };
  },
}));

const { callWithModel, forgetAvailableModels, resolveModel } = await import('./aiModel.js');

const unknownModel = () => Object.assign(new Error('model: not found'), { status: 404 });

beforeEach(() => {
  forgetAvailableModels();
  h.listCalls = 0;
  h.saved = 'claude-sonnet-4-5';
  h.offered = [
    { id: 'claude-sonnet-4-5', display_name: 'Sonnet 4.5', created_at: '2025-09-29T00:00:00Z' },
    { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5', created_at: '2026-09-28T00:00:00Z' },
    { id: 'claude-haiku-4-5',  display_name: 'Haiku 4.5',  created_at: '2025-10-01T00:00:00Z' },
  ];
});

describe('callWithModel', () => {
  it('uses the chosen model while it is offered', async () => {
    const call = vi.fn(async (m) => `answer from ${m}`);
    const out = await callWithModel(call);
    expect(out.result).toBe('answer from claude-sonnet-4-5');
    expect(out.substituted).toBe(false);
  });

  it('a model refused as unknown is replaced within its family and retried once', async () => {
    const call = vi.fn(async (m) => {
      if (m === 'claude-sonnet-4-5') throw unknownModel();
      return `answer from ${m}`;
    });
    // Anthropic's fresh list no longer carries it.
    const fresh = h.offered.filter((m) => m.id !== 'claude-sonnet-4-5');
    call.mockImplementationOnce(async () => { h.offered = fresh; throw unknownModel(); });
    const out = await callWithModel(call);
    expect(out.model).toBe('claude-sonnet-5-5');
    expect(out.substituted).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('any other failure is not retried', async () => {
    const call = vi.fn(async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); });
    await expect(callWithModel(call)).rejects.toThrow('overloaded');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('reads the list once an hour, not on every call', async () => {
    await resolveModel();
    await resolveModel();
    expect(h.listCalls).toBe(1);
  });
});
