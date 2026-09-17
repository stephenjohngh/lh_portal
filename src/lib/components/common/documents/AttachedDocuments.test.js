// @vitest-environment jsdom
//
// src/lib/components/common/documents/AttachedDocuments.test.js
//
// TYPE-2 (component DOM/interaction) test, following ProtectedButton.test.js.
//
// Why this file exists: a Category field was added to this panel and the first
// real upload through it stored `category: null`. Two separate faults could
// produce that — the value never reaching the payload, or the list simply not
// showing what was stored — and prose could not tell them apart. These assert
// the PAYLOAD the panel sends and the TEXT the list renders, which are the two
// things a person actually experiences.
//
// Queries are by role/label/text throughout; nothing here depends on markup.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
  listDocuments:  vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('$lib/utils/documentApi', () => h);
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: vi.fn() }));

const AttachedDocuments = (await import('./AttachedDocuments.svelte')).default;

/** A File the picker will accept. */
const aFile = (name = 'EWS1 form.pdf') =>
  new File(['x'], name, { type: 'application/pdf' });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.listDocuments.mockResolvedValue([]);
  h.uploadDocument.mockImplementation(async (_file, meta) => ({
    id: 'new-doc', filename: 'f.pdf', display_name: 'f.pdf', created_at: '2026-09-17', ...meta,
  }));
});

/** Open the upload form and put a file on it. */
async function startUpload(name) {
  await fireEvent.click(screen.getByRole('button', { name: /upload/i }));
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [aFile(name)], configurable: true });
  await fireEvent.change(input);
}

describe('AttachedDocuments — the category reaches the payload', () => {
  it('sends the category the person chose', async () => {
    render(AttachedDocuments, { entityType: 'info_note', entityId: 'n1', canEdit: true });
    await startUpload('scan001.pdf');

    await fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'ews1' } });
    await fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalled());
    expect(h.uploadDocument.mock.calls[0][1]).toMatchObject({ category: 'ews1' });
  });

  it('sends the suggestion when the filename carries one and nothing is changed', async () => {
    render(AttachedDocuments, { entityType: 'info_note', entityId: 'n1', canEdit: true });
    await startUpload('EWS1 form.pdf');

    await fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalled());
    expect(h.uploadDocument.mock.calls[0][1]).toMatchObject({ category: 'ews1' });
  });

  it('omits the category rather than inventing one when nothing matches', async () => {
    render(AttachedDocuments, { entityType: 'info_note', entityId: 'n1', canEdit: true });
    await startUpload('scan001.pdf');

    await fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalled());
    expect(h.uploadDocument.mock.calls[0][1].category).toBeUndefined();
  });

  it('does not overwrite a chosen category when the component re-renders', async () => {
    // The trap this guards: `file` is an object, and Svelte reports every
    // object prop as changed, so a reactive block keyed on `file` rather than
    // on `file.name` would re-apply the suggestion over the person's choice.
    const { rerender } = render(AttachedDocuments,
      { entityType: 'info_note', entityId: 'n1', canEdit: true });
    await startUpload('EWS1 form.pdf');

    await fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'warranty' } });
    // A parent update, which for PackWorkspace happens on every store change.
    await rerender({ entityType: 'info_note', entityId: 'n1', canEdit: true, title: 'Files' });
    await fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalled());
    expect(h.uploadDocument.mock.calls[0][1]).toMatchObject({ category: 'warranty' });
  });
});

describe('AttachedDocuments — the list shows what was stored', () => {
  it('shows the category of an attached document', async () => {
    // Asking for a value and then never displaying it is indistinguishable,
    // to the person who typed it, from not having saved it.
    h.listDocuments.mockResolvedValue([{
      id: 'd1', filename: 'ews1.pdf', display_name: 'ews1.pdf',
      category: 'ews1', doc_type: 'pdf', file_size: 1024, created_at: '2026-09-17',
    }]);
    render(AttachedDocuments, { entityType: 'info_note', entityId: 'n1' });

    expect(await screen.findByText(/EWS1/)).toBeInTheDocument();
  });

  it('says nothing about category when a document has none', async () => {
    h.listDocuments.mockResolvedValue([{
      id: 'd1', filename: 'a.pdf', display_name: 'a.pdf',
      category: null, doc_type: 'pdf', file_size: 1024, created_at: '2026-09-17',
    }]);
    render(AttachedDocuments, { entityType: 'info_note', entityId: 'n1' });

    await screen.findByText('a.pdf');
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
