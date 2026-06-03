// src/lib/apps/articles/stores/articlesStore.js
// CRUD store for portal_articles.
// Admins see all articles (drafts + published) via RLS.
// Public reads (anon) are handled directly in the public /info/ pages.

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api }      from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('articlesStore');

const SELECT = `
  *,
  created_by_profile:profiles!created_by(full_name),
  updated_by_profile:profiles!updated_by(full_name)
`;

function audit(eventType, id, title, data = {}) {
  logAudit(eventType, 'article', id, title, {
    appId: 'articles', eventCategory: 'articles',
    severity: eventType === 'delete' ? 'warning' : 'info',
    ...data
  });
}

function createArticlesStore() {
  const { subscribe, update } = writable({
    articles: [],
    loading:  false,
    error:    ''
  });

  return {
    subscribe,

    async fetchArticles() {
      update(s => ({ ...s, loading: true, error: '' }));
      try {
        const articles = await api.get('portal_articles', {
          select:    SELECT,
          orderBy:   'created_at',
          ascending: false
        });
        update(s => ({ ...s, articles, loading: false }));
      } catch (err) {
        logger('❌ fetchArticles:', err.message);
        update(s => ({ ...s, error: err.message, loading: false }));
      }
    },

    async createArticle(data) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const now = new Date().toISOString();
        const row = await api.create('portal_articles', {
          slug:        data.slug?.trim(),
          title:       data.title?.trim(),
          summary:     data.summary?.trim() || null,
          content:     data.content         || null,
          published:   data.published       ?? false,
          published_at: data.published      ? now : null,
          created_at:  now,
          updated_at:  now,
          created_by:  user?.id,
          updated_by:  user?.id
        });
        // Re-fetch to get joined profile data
        await this.fetchArticles();
        audit('create', row.id, row.title, { afterData: { slug: row.slug, published: row.published } });
        return { success: true };
      } catch (err) {
        logger('❌ createArticle:', err.message);
        return { success: false, error: err.message };
      }
    },

    async updateArticle(id, data) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const now = new Date().toISOString();

        // Stamp published_at the first time the article is published
        const existing = await api.getById('portal_articles', id, 'published, published_at');
        const wasPublished = existing?.published;
        const publishedAt  = data.published
          ? (wasPublished ? existing?.published_at : now)
          : null;

        await api.update('portal_articles', id, {
          slug:        data.slug?.trim(),
          title:       data.title?.trim(),
          summary:     data.summary?.trim() || null,
          content:     data.content         || null,
          published:   data.published       ?? false,
          published_at: publishedAt,
          updated_at:  now,
          updated_by:  user?.id
        });
        await this.fetchArticles();
        audit('update', id, data.title, { afterData: { slug: data.slug, published: data.published } });
        return { success: true };
      } catch (err) {
        logger('❌ updateArticle:', err.message);
        return { success: false, error: err.message };
      }
    },

    async deleteArticle(id) {
      try {
        const before = await api.getById('portal_articles', id, 'id, title, slug');
        await api.delete('portal_articles', id);
        update(s => ({ ...s, articles: s.articles.filter(a => a.id !== id) }));
        audit('delete', id, before?.title ?? id, { beforeData: before });
        return { success: true };
      } catch (err) {
        logger('❌ deleteArticle:', err.message);
        return { success: false, error: err.message };
      }
    },

    clearError() {
      update(s => ({ ...s, error: '' }));
    }
  };
}

export const articlesStore = createArticlesStore();
