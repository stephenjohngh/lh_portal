// src/lib/stores/documentsStore.js
// Client-side store for the document library.
// All server communication goes through the /api/documents/* routes.
// Every request includes the user's Supabase access token in the Authorization
// header — the server verifies it via requireAuth() / requireAdmin().

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';

/** @returns {Promise<Record<string,string>>} headers including the bearer token, if any */
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

function createDocumentsStore() {
  const { subscribe, update } = writable({
    docs:    [],
    loading: false,
    error:   null,
  });

  /**
   * Load documents matching the given filters.
   * @param {Object} [opts]
   */
  async function load(opts = {}) {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined && v !== null && v !== '') params.set(k, v);
      }
      const res  = await fetch(`/api/documents?${params}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load documents');
      update(s => ({ ...s, docs: data, loading: false }));
    } catch (err) {
      update(s => ({ ...s, error: err.message, loading: false }));
    }
  }

  /**
   * Upload a file with metadata. Appends the new doc to the local list.
   * @param {File}   file
   * @param {Object} meta  - document_library metadata fields
   * @returns {Promise<Object>}  The new document_library row
   */
  async function upload(file, meta = {}) {
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null) {
        form.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
      }
    }

    try {
      const res = await fetch('/api/documents/upload', {
        method:  'POST',
        headers: await authHeaders(),
        body:    form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');

      update(s => ({ ...s, docs: [data, ...s.docs] }));
      return data;
    } catch (err) {
      update(s => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /**
   * Get a fresh viewable URL for a document.
   * @param {string} id
   * @returns {Promise<string>}
   */
  async function getUrl(id) {
    const res  = await fetch(`/api/documents/${id}/url`, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to get URL');
    return data.url;
  }

  /**
   * Update document metadata.
   * @param {string} id
   * @param {Object} patch
   */
  async function updateMeta(id, patch) {
    const res = await fetch(`/api/documents/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body:    JSON.stringify({ patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Update failed');
    update(s => ({ ...s, docs: s.docs.map(d => d.id === id ? data : d) }));
    return data;
  }

  /**
   * Delete a document from storage and the index, then remove from local list.
   * @param {string} id
   */
  async function remove(id) {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method:  'DELETE',
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      update(s => ({ ...s, docs: s.docs.filter(d => d.id !== id) }));
    } catch (err) {
      update(s => ({ ...s, error: err.message }));
      throw err;
    }
  }

  function clearError() {
    update(s => ({ ...s, error: null }));
  }

  return { subscribe, load, upload, getUrl, updateMeta, remove, clearError };
}

export const documentsStore = createDocumentsStore();
