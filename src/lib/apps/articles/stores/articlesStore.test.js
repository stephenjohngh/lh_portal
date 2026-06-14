// src/lib/apps/articles/stores/articlesStore.test.js
// CHARACTERIZATION tests for articlesStore. The interesting contract is the
// published_at stamping across visibility transitions and that content is
// sanitised at the write boundary (it's rendered with {@html} publicly).
// Seams mocked: supabaseClient (auth), api, auditLogger, sanitizeHtml, logger.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let existing = { visibility: 'draft', published_at: null };
  const api = {
    get:     vi.fn(() => Promise.resolve([])),
    getById: vi.fn(() => Promise.resolve(existing)),
    create:  vi.fn((t, d) => Promise.resolve({ id: 'art1', ...d })),
    update:  vi.fn(() => Promise.resolve({})),
    delete:  vi.fn(() => Promise.resolve()),
  };
  return {
    api, logAudit: vi.fn(),
    sanitizeHtml: vi.fn((s) => `clean:${s ?? ''}`),
    supabase: { auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } },
    setExisting: (e) => { existing = e; },
  };
});

vi.mock('$lib/supabaseClient',    () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/sanitizeHtml',() => ({ sanitizeHtml: h.sanitizeHtml }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));

const { articlesStore } = await import('./articlesStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.api.get.mockResolvedValue([]);
  h.setExisting({ visibility: 'draft', published_at: null });
});

describe('fetchArticles', () => {
  it('loads newest-first and clears loading', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await articlesStore.fetchArticles();
    const s = get(articlesStore);
    expect(s.articles).toHaveLength(2);
    expect(s.loading).toBe(false);
    expect(h.api.get).toHaveBeenCalledWith('portal_articles', expect.objectContaining({ orderBy: 'created_at', ascending: false }));
  });

  it('captures the error and clears loading on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('rls'));
    await articlesStore.fetchArticles();
    expect(get(articlesStore).error).toBe('rls');
  });
});

describe('createArticle', () => {
  it('sanitises content and leaves published_at null for a draft', async () => {
    const r = await articlesStore.createArticle({ slug: 's', title: 'T', content: '<b>x</b>', visibility: 'draft' });
    expect(r).toEqual({ success: true });
    expect(h.sanitizeHtml).toHaveBeenCalledWith('<b>x</b>');
    const arg = h.api.create.mock.calls[0][1];
    expect(arg.content).toBe('clean:<b>x</b>');
    expect(arg.published_at).toBeNull();
  });

  it('stamps published_at when created already public/registered', async () => {
    await articlesStore.createArticle({ slug: 's', title: 'T', content: 'x', visibility: 'public' });
    expect(h.api.create.mock.calls[0][1].published_at).toBeTruthy();
  });

  it('returns failure (not throw) when the insert errors', async () => {
    h.api.create.mockRejectedValueOnce(new Error('dup slug'));
    expect(await articlesStore.createArticle({ slug: 's', title: 'T', content: 'x' })).toEqual({ success: false, error: 'dup slug' });
  });
});

describe('updateArticle — published_at stamping', () => {
  it('stamps published_at the first time an article leaves draft', async () => {
    h.setExisting({ visibility: 'draft', published_at: null });
    await articlesStore.updateArticle('art1', { slug: 's', title: 'T', content: 'x', visibility: 'public' });
    expect(h.api.update.mock.calls[0][1]).toBe('art1');
    expect(h.api.update.mock.calls[0][2].published_at).toBeTruthy();
  });

  it('preserves the original published_at when it was already live', async () => {
    h.setExisting({ visibility: 'public', published_at: '2025-01-01T00:00:00Z' });
    await articlesStore.updateArticle('art1', { slug: 's', title: 'T', content: 'x', visibility: 'registered' });
    expect(h.api.update.mock.calls[0][2].published_at).toBe('2025-01-01T00:00:00Z');
  });

  it('clears published_at when reverting to draft', async () => {
    h.setExisting({ visibility: 'public', published_at: '2025-01-01T00:00:00Z' });
    await articlesStore.updateArticle('art1', { slug: 's', title: 'T', content: 'x', visibility: 'draft' });
    expect(h.api.update.mock.calls[0][2].published_at).toBeNull();
  });
});

describe('deleteArticle', () => {
  it('removes the article from state and audits with beforeData', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'art1' }, { id: 'art2' }]);
    await articlesStore.fetchArticles();
    h.api.getById.mockResolvedValueOnce({ id: 'art1', title: 'Doomed', slug: 'd' });
    const r = await articlesStore.deleteArticle('art1');
    expect(r).toEqual({ success: true });
    expect(h.api.delete).toHaveBeenCalledWith('portal_articles', 'art1');
    expect(get(articlesStore).articles.map(a => a.id)).toEqual(['art2']);
    expect(h.logAudit).toHaveBeenCalledWith('delete', 'article', 'art1', 'Doomed', expect.objectContaining({ severity: 'warning' }));
  });
});
