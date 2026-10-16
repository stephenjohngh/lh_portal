// @vitest-environment jsdom
//
// The note form offers files where people look for them (user, 2026-10-16):
// on Edit the shared documents panel, on New a picker whose files travel with
// the save so the app can upload them once the note exists.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
  listDocuments:  vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  updateDocument: vi.fn(),
}));
vi.mock('#lib/utils/documentApi.js', () => h);
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
vi.mock('#lib/stores/portalSettings.js', () => ({
  portalSettings: { subscribe: (/** @type {(v: object) => void} */ fn) => { fn({}); return () => {}; } },
}));
vi.mock('#lib/stores/permissions.js', () => ({
  permissions: { subscribe: (/** @type {(v: object) => void} */ fn) => { fn({ isAdmin: false, canModify: true }); return () => {}; } },
}));
// The rich editor is irrelevant here and heavy to load.
vi.mock('#lib/components/common/LazyRichTextEditor.svelte', async () => ({
  default: (await import('#lib/components/common/Checkbox.svelte')).default,
}));

const NoteFormModal = (await import('./NoteFormModal.svelte')).default;
const SECTIONS = [{ id: 's1', name: 'General' }];

beforeEach(() => { cleanup(); vi.clearAllMocks(); h.listDocuments.mockResolvedValue([]); });

describe('NoteFormModal — files', () => {
  it('Edit shows the note’s files with an upload', async () => {
    h.listDocuments.mockResolvedValue([{ id: 'd1', filename: 'plan.pdf', display_name: 'plan.pdf', created_at: '2026-10-01' }]);
    render(NoteFormModal, { show: true, sections: SECTIONS, note: { id: 'n1', title: 'Lift', section_id: 's1' } });
    await waitFor(() => expect(screen.getByText('plan.pdf')).toBeTruthy());
    expect(h.listDocuments).toHaveBeenCalledWith({ entity_type: 'info_note', entity_id: 'n1' });
    expect(screen.getByRole('button', { name: /upload/i })).toBeTruthy();
  });

  it('New holds picked files and sends them with the save', async () => {
    const saved = vi.fn();
    render(NoteFormModal, { props: { show: true, sections: SECTIONS, note: null }, events: { save: (/** @type {any} */ e) => saved(e.detail) } });
    const input = /** @type {HTMLInputElement} */ (document.querySelector('[data-testid="note-pending-files"] input[type="file"]'));
    const file = new File(['x'], 'quote.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
    expect(screen.getByText('quote.pdf')).toBeTruthy();
    await fireEvent.input(screen.getByPlaceholderText('Note title…'), { target: { value: 'New lift' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Note' }));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][0].files).toEqual([file]);
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });
});
