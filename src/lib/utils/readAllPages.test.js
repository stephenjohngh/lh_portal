// src/lib/utils/readAllPages.test.js
// Reading every page, and the order getAll pages in. ⛔ A read without a range
// stops at 1,000 rows and says nothing; a page boundary that falls inside a
// run of equal sort values repeats or loses rows unless a unique column breaks
// the tie. §6ccc item 3, 2026-10-03.
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => {
  let pages = [];
  const calls = [];
  const builder = () => {
    const b = { orders: [], eqs: [] };
    for (const m of ['select', 'in']) b[m] = vi.fn(() => b);
    b.eq    = vi.fn((k, v) => { b.eqs.push([k, v]); return b; });
    b.order = vi.fn((col, o) => { b.orders.push([col, o?.ascending !== false]); return b; });
    b.range = vi.fn((from, to) => { calls.push({ from, to, orders: b.orders, eqs: b.eqs }); return Promise.resolve(pages.shift() ?? { data: [], error: null }); });
    return b;
  };
  return { setPages: (p) => { pages = p; }, calls, supabase: { from: vi.fn(() => builder()) } };
});

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { readAllPages, chunks } = await import('./readAllPages.js');
const { api } = await import('./api.js');

const rows = (n, from = 0) => ({ data: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}` })), error: null });

describe('readAllPages', () => {
  it('keeps reading until a short page', async () => {
    h.setPages([rows(1000), rows(1000, 1000), rows(547, 2000)]);
    h.calls.length = 0;
    const out = await readAllPages(() => h.supabase.from('t').select('*'));
    expect(out).toHaveLength(2547);
    expect(h.calls.map((c) => [c.from, c.to])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('throws the error rather than returning what it had', async () => {
    h.setPages([rows(1000), { data: null, error: { message: 'timeout' } }]);
    await expect(readAllPages(() => h.supabase.from('t').select('*'))).rejects.toMatchObject({ message: 'timeout' });
  });

  it('chunks a list', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('api.getAll orders with no ties', () => {
  it('breaks ties on id when sorting on anything else', async () => {
    h.setPages([rows(3)]); h.calls.length = 0;
    await api.getAll('maintenance_jobs', { orderBy: 'scheduled_date', filters: { status: 'scheduled' } });
    expect(h.calls[0].orders).toEqual([['scheduled_date', true], ['id', true]]);
    expect(h.calls[0].eqs).toEqual([['status', 'scheduled']]);
  });

  it('adds nothing when the sort column is id, or the caller says it is unique', async () => {
    h.setPages([rows(1), rows(1)]); h.calls.length = 0;
    await api.getAll('issues');
    await api.getAll('statutory_register', { orderBy: 'template_key', tiebreak: false });
    expect(h.calls.map((c) => c.orders)).toEqual([[['id', true]], [['template_key', true]]]);
  });

  it('getAllIn breaks ties too, and applies its eq filters', async () => {
    h.setPages([rows(1)]); h.calls.length = 0;
    await api.getAllIn('components', 'type_code', ['door'], { orderBy: 'asset_id', filters: { status: 'ok' } });
    expect(h.calls[0].orders).toEqual([['asset_id', true], ['id', true]]);
    expect(h.calls[0].eqs).toEqual([['status', 'ok']]);
  });
});
