// src/lib/stores/documentsStore.js
// Client-side store for the document library.
// All server communication goes through the /api/documents/* routes.
// Every request includes the user's Supabase access token in the Authorization
// header — the server verifies it via requireAuth() / requireAdmin().

import { writable } from 'svelte/store';
import * as docApi from '$lib/utils/documentApi';

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
      const data = await docApi.listDocuments(opts);
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
    try {
      const data = await docApi.uploadDocument(file, meta);
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
    return docApi.getDocumentUrl(id);
  }

  /**
   * Update document metadata.
   * @param {string} id
   * @param {Object} patch
   */
  async function updateMeta(id, patch) {
    const data = await docApi.updateDocument(id, patch);
    update(s => ({ ...s, docs: s.docs.map(d => d.id === id ? data : d) }));
    return data;
  }

  /**
   * Delete a document from storage and the index, then remove from local list.
   * @param {string} id
   */
  async function remove(id) {
    try {
      await docApi.deleteDocument(id);
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
