// src/lib/apps/info/stores/infoStore.js

import { writable }    from 'svelte/store';
import { api }         from '$lib/utils/api';
import { supabase }    from '$lib/supabaseClient';
import { logAudit }    from '$lib/utils/auditLogger';
import { getLogger }   from '$lib/utils/logger';

const logger = getLogger('infoStore');

const NOTE_SELECT =
  '*, section:info_sections(id,name,colour), documents:info_documents(id)';

const NOTE_DETAIL_SELECT =
  '*, section:info_sections(id,name,colour), documents:info_documents(*), creator:profiles!created_by(full_name,email)';

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

  async function loadNote(noteId) {
    update(s => ({ ...s, loadingNote: true, error: null }));
    try {
      const note = await api.getById('info_notes', noteId, NOTE_DETAIL_SELECT);
      update(s => ({ ...s, selectedNote: note, loadingNote: false }));
      return note;
    } catch (err) {
      update(s => ({ ...s, error: err.message, loadingNote: false }));
      throw err;
    }
  }

  function clearNote() {
    update(s => ({ ...s, selectedNote: null }));
  }

  async function createNote(data, userId) {
    const note = await api.create('info_notes', {
      ...data,
      tags:      data.tags      ?? [],
      is_pinned: data.is_pinned ?? false,
      status:    'active',
      created_by: userId, updated_by: userId,
    }, true);
    logAudit('create', 'info_note', note.id, note.title,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        afterData: { title: note.title, section_id: note.section_id } });
    return note;
  }

  async function updateNote(id, data, userId) {
    const note = await api.update('info_notes', id,
      { ...data, updated_by: userId }, true);
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
    await api.delete('info_notes', id);
    update(s => ({
      ...s,
      notes:        s.notes.filter(n => n.id !== id),
      selectedNote: s.selectedNote?.id === id ? null : s.selectedNote,
    }));
    logAudit('delete', 'info_note', id, title,
      { appId: 'info', eventCategory: 'info', severity: 'info' });
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

  // ── Documents ─────────────────────────────────────────────────────────────

  async function uploadDocument(noteId, file, description, userId) {
    const ts          = Date.now();
    const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${noteId}/${ts}_${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('info-docs')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message);

    const doc = await api.create('info_documents', {
      note_id:      noteId,
      filename:     file.name,
      storage_path: storagePath,
      file_size:    file.size,
      mime_type:    file.type || null,
      description:  description || null,
      uploaded_by:  userId,
    }, true);

    update(s => ({
      ...s,
      selectedNote: s.selectedNote?.id === noteId
        ? { ...s.selectedNote, documents: [...(s.selectedNote.documents ?? []), doc] }
        : s.selectedNote,
      notes: s.notes.map(n => n.id === noteId
        ? { ...n, documents: [...(n.documents ?? []), { id: doc.id }] }
        : n),
    }));

    logAudit('create', 'info_document', doc.id, file.name,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        afterData: { note_id: noteId, filename: file.name } });
    return doc;
  }

  async function deleteDocument(docId, storagePath, noteId) {
    await supabase.storage.from('info-docs').remove([storagePath]);
    await api.delete('info_documents', docId);
    update(s => ({
      ...s,
      selectedNote: s.selectedNote?.id === noteId
        ? { ...s.selectedNote,
            documents: s.selectedNote.documents.filter(d => d.id !== docId) }
        : s.selectedNote,
      notes: s.notes.map(n => n.id === noteId
        ? { ...n, documents: (n.documents ?? []).filter(d => d.id !== docId) }
        : n),
    }));
    logAudit('delete', 'info_document', docId, storagePath,
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
