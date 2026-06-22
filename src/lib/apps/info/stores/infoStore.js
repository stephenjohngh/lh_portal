// src/lib/apps/info/stores/infoStore.js
// Documents use the shared document_library system (entity_type='info_note').
// All document I/O goes through /api/documents/* — never direct Supabase storage.

import { writable }    from 'svelte/store';
import { api }         from '$lib/utils/api';
import * as docApi     from '$lib/utils/documentApi';
import { logAudit }    from '$lib/utils/auditLogger';
import { sanitizeHtml } from '$lib/utils/sanitizeHtml';
import { getLogger }   from '$lib/utils/logger';

const logger = getLogger('infoStore');

const NOTE_SELECT =
  '*, section:info_sections(id,name,colour)';

const NOTE_DETAIL_SELECT =
  '*, section:info_sections(id,name,colour), creator:profiles!created_by(full_name,email)';

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

function createInfoStore() {
  const { subscribe, update } = writable({
    sections:        [],
    notes:           [],
    selectedNote:    null,   // full note + documents loaded on select
    loadingSections: false,
    loadingNotes:    false,
    loadingNote:     false,
    error:           null,
  });

  // ── Sections ─────────────────────────────────────────────────────────────

  async function loadSections() {
    update(s => ({ ...s, loadingSections: true, error: null }));
    try {
      const sections = await api.get('info_sections', {
        orderBy: 'display_order', ascending: true,
      });
      update(s => ({ ...s, sections, loadingSections: false }));
    } catch (err) {
      update(s => ({ ...s, error: err.message, loadingSections: false }));
      throw err;
    }
  }

  async function createSection(data, userId) {
    const section = await api.create('info_sections', {
      ...data,
      display_order: data.display_order ?? 0,
      created_by: userId, updated_by: userId,
    }, true);
    update(s => ({
      ...s,
      sections: [...s.sections, section]
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    }));
    logAudit('create', 'info_section', section.id, section.name,
      { appId: 'info', eventCategory: 'info', severity: 'info', afterData: data });
    return section;
  }

  async function updateSection(id, data, userId) {
    const section = await api.update('info_sections', id,
      { ...data, updated_by: userId }, true);
    update(s => ({
      ...s,
      sections: s.sections.map(sec => sec.id === id ? section : sec)
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    }));
    logAudit('update', 'info_section', id, section.name,
      { appId: 'info', eventCategory: 'info', severity: 'info', afterData: data });
    return section;
  }

  async function deleteSection(id, name) {
    await api.delete('info_sections', id);
    update(s => ({ ...s, sections: s.sections.filter(sec => sec.id !== id) }));
    logAudit('delete', 'info_section', id, name,
      { appId: 'info', eventCategory: 'info', severity: 'info' });
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async function loadNotes(sectionId = null) {
    update(s => ({ ...s, loadingNotes: true, error: null }));
    try {
      const notes = await api.get('info_notes', {
        select:    NOTE_SELECT,
        filters:   sectionId ? { section_id: sectionId } : {},
        orderBy:   'updated_at',
        ascending: false,
      });
      update(s => ({ ...s, notes: sortNotes(notes), loadingNotes: false }));
    } catch (err) {
      update(s => ({ ...s, error: err.message, loadingNotes: false }));
      throw err;
    }
  }

  async function loadNoteDocuments(noteId) {
    return docApi.listDocuments({ entity_type: 'info_note', entity_id: noteId });
  }

  async function loadNote(noteId) {
    update(s => ({ ...s, loadingNote: true, error: null }));
    try {
      const [note, documents] = await Promise.all([
        api.getById('info_notes', noteId, NOTE_DETAIL_SELECT),
        loadNoteDocuments(noteId),
      ]);
      const full = { ...note, documents };
      update(s => ({ ...s, selectedNote: full, loadingNote: false }));
      return full;
    } catch (err) {
      update(s => ({ ...s, error: err.message, loadingNote: false }));
      throw err;
    }
  }

  function clearNote() {
    update(s => ({ ...s, selectedNote: null }));
  }

  async function createNote(data, userId) {
    const visibility = data.visibility ?? 'internal';
    const note = await api.create('info_notes', {
      section_id:   data.section_id,
      title:        data.title,
      // Body is rich HTML — sanitise at the write boundary (it is rendered
      // with {@html} both in-app and on the public /info pages).
      body:         data.body ? sanitizeHtml(data.body) : null,
      tags:         data.tags      ?? [],
      is_pinned:    data.is_pinned ?? false,
      status:       'active',
      // Publishing fields (only admins ever send non-internal — see RLS).
      slug:         data.slug?.trim()    || null,
      summary:      data.summary?.trim() || null,
      visibility,
      published_at: visibility === 'internal' ? null : new Date().toISOString(),
      created_by: userId, updated_by: userId,
    }, true);
    logAudit('create', 'info_note', note.id, note.title,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        afterData: { title: note.title, section_id: note.section_id, visibility } });
    return note;
  }

  async function updateNote(id, data, userId) {
    const visibility = data.visibility ?? 'internal';
    // Stamp published_at the first time a note becomes visible; clear it when
    // returned to internal. Preserve the original timestamp on re-saves.
    let published_at = null;
    if (visibility !== 'internal') {
      const existing = await api.getById('info_notes', id, 'published_at');
      published_at = existing?.published_at ?? new Date().toISOString();
    }
    const note = await api.update('info_notes', id, {
      section_id:   data.section_id,
      title:        data.title,
      body:         data.body ? sanitizeHtml(data.body) : null,
      tags:         data.tags ?? [],
      is_pinned:    data.is_pinned ?? false,
      slug:         data.slug?.trim()    || null,
      summary:      data.summary?.trim() || null,
      visibility,
      published_at,
      updated_by: userId,
    }, true);
    // Patch in-list and selectedNote without a full reload
    update(s => ({
      ...s,
      notes: sortNotes(s.notes.map(n => n.id === id ? { ...n, ...note } : n)),
      selectedNote: s.selectedNote?.id === id
        ? { ...s.selectedNote, ...note }
        : s.selectedNote,
    }));
    logAudit('update', 'info_note', id, note.title,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        afterData: { title: note.title } });
    return note;
  }

  async function deleteNote(id, title) {
    // document_library is polymorphic (no FK to info_notes), so deleting the
    // note does NOT cascade to its attachments. Delete them first — Drive
    // files + index rows — via the same endpoint single-delete uses, so they
    // aren't orphaned. Best-effort: a failed attachment delete must not block
    // deleting the note.
    let docs = [];
    try {
      docs = await loadNoteDocuments(id);
    } catch (err) {
      logger('⚠ could not list attachments before note delete:', err.message);
    }
    if (docs.length) {
      const results = await Promise.allSettled(docs.map(d => docApi.deleteDocument(d.id)));
      const failed  = results.filter(r => r.status === 'rejected').length;
      if (failed) logger(`⚠ ${failed}/${docs.length} attachment(s) may not have been deleted for note ${id}`);
    }

    await api.delete('info_notes', id);
    update(s => ({
      ...s,
      notes:        s.notes.filter(n => n.id !== id),
      selectedNote: s.selectedNote?.id === id ? null : s.selectedNote,
    }));
    logAudit('delete', 'info_note', id, title,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        metadata: { deleted_attachments: docs.length } });
  }

  async function togglePin(id, currentPinned) {
    await api.update('info_notes', id, { is_pinned: !currentPinned });
    update(s => ({
      ...s,
      notes: sortNotes(s.notes.map(n =>
        n.id === id ? { ...n, is_pinned: !currentPinned } : n)),
      selectedNote: s.selectedNote?.id === id
        ? { ...s.selectedNote, is_pinned: !currentPinned }
        : s.selectedNote,
    }));
  }

  async function setArchived(id, archived) {
    const status = archived ? 'archived' : 'active';
    await api.update('info_notes', id, { status });
    update(s => ({
      ...s,
      notes: s.notes.map(n => n.id === id ? { ...n, status } : n),
      selectedNote: s.selectedNote?.id === id
        ? { ...s.selectedNote, status }
        : s.selectedNote,
    }));
  }

  // ── Documents (via document_library / /api/documents/*) ───────────────────
  // entity_type = 'info_note', entity_id = noteId

  async function uploadDocument(noteId, file, description) {
    const doc = await docApi.uploadDocument(file, {
      entity_type:  'info_note',
      entity_id:    noteId,
      display_name: file.name,
      doc_type:     'other',
      folder_path:  'Info Notes',
      description:  description || undefined,
    });

    // Append to selectedNote.documents if we're viewing this note
    update(s => ({
      ...s,
      selectedNote: s.selectedNote?.id === noteId
        ? { ...s.selectedNote, documents: [doc, ...(s.selectedNote.documents ?? [])] }
        : s.selectedNote,
    }));

    logAudit('create', 'info_document', doc.id, file.name,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        afterData: { note_id: noteId, filename: file.name } });
    return doc;
  }

  async function deleteDocument(docId, noteId) {
    await docApi.deleteDocument(docId);
    update(s => ({
      ...s,
      selectedNote: s.selectedNote?.id === noteId
        ? { ...s.selectedNote,
            documents: (s.selectedNote.documents ?? []).filter(d => d.id !== docId) }
        : s.selectedNote,
    }));
    logAudit('delete', 'info_document', docId, docId,
      { appId: 'info', eventCategory: 'info', severity: 'info' });
  }

  return {
    subscribe,
    loadSections,  createSection,  updateSection,  deleteSection,
    loadNotes,     createNote,     updateNote,     deleteNote,
    loadNote,      clearNote,
    togglePin,     setArchived,
    uploadDocument, deleteDocument,
  };
}

export const infoStore = createInfoStore();
