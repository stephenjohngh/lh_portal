// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  /** @type {Set<(v: any) => void>} */
  const subs = new Set();
  let state = {};
  const store = {
    subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },
    set(v) { state = v; subs.forEach(f => f(state)); },
    createFolder: vi.fn(), renameFolder: vi.fn(), moveFolder: vi.fn(), deleteFolder: vi.fn(),
    placeFile: vi.fn(async () => {}), addFile: vi.fn(), patchFile: vi.fn(), removeFile: vi.fn(),
  };
  return { store, uploadDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() };
});

vi.mock('../stores/dossierStore.js', () => ({ dossierStore: h.store }));
vi.mock('#lib/utils/documentApi.js', () => ({
  uploadDocument: h.uploadDocument, updateDocument: h.updateDocument, deleteDocument: h.deleteDocument,
}));
vi.mock('#lib/utils/currentUser.js', () => ({ currentUserId: async () => 'u1' }));

const PackFiles = (await import('./PackFiles.svelte')).default;

const folders = [
  { id: 'aaaaaaaa-1111', pack_id: 'p1', parent_id: null, name: 'Plans' },
  { id: 'bbbbbbbb-2222', pack_id: 'p1', parent_id: 'aaaaaaaa-1111', name: 'Old plans' },
];
const files = [
  { id: 'f1', display_name: 'roof.png', mime_type: 'image/png', file_size: 100 },
  { id: 'f2', display_name: 'top floor.png', mime_type: 'image/png', file_size: 100 },
];
const placements = [{ document_id: 'f2', pack_id: 'p1', folder_id: 'bbbbbbbb-2222' }];

const state = (extra = {}) => ({ folders, files, placements, inheritedFiles: [], inheritedFolders: [], inheritedPlacements: [], inheritedError: null, ...extra });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.store.set(state());
  h.uploadDocument.mockImplementation(async (f) => ({ id: 'n-' + f.name, display_name: f.name }));
});

const pack = { id: 'p1', title: 'Surveyor brief' };

describe('PackFiles', () => {
  it('shows folders and files, with unplaced files at the top level', () => {
    render(PackFiles, { pack, canEdit: true, isAdmin: true });
    expect(screen.getByText('Plans')).toBeInTheDocument();
    expect(screen.getByText('Old plans')).toBeInTheDocument();
    expect(screen.getByText('roof.png')).toBeInTheDocument();
    expect(screen.getByText('top floor.png')).toBeInTheDocument();
  });

  it('enables the actions only once something is selected', async () => {
    render(PackFiles, { pack, canEdit: true, isAdmin: true });
    expect(screen.getByRole('button', { name: /rename/i })).toBeDisabled();
    await fireEvent.click(screen.getByText('Old plans'));
    expect(screen.getByRole('button', { name: /rename/i })).toBeEnabled();
  });

  it('uploads into the selected folder: its storage path and its placement', async () => {
    render(PackFiles, { pack, canEdit: true, isAdmin: false });
    await fireEvent.click(screen.getByText('Old plans'));
    await fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })], configurable: true });
    await fireEvent.change(input);
    await fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalled());
    const meta = h.uploadDocument.mock.calls[0][1];
    expect(meta).toMatchObject({ entity_type: 'dossier_pack', entity_id: 'p1' });
    expect(meta.folder_path).toMatch(/^Dossier Packs\/Surveyor brief \(.*\)\/Plans \(aaaaaaaa\)\/Old plans \(bbbbbbbb\)$/);
    expect(meta.category).toBeUndefined();
    await waitFor(() => expect(h.store.placeFile).toHaveBeenCalledWith('n-a.png', 'p1', 'bbbbbbbb-2222', 'u1'));
  });

  it('moves a file back to the top level', async () => {
    render(PackFiles, { pack, canEdit: true, isAdmin: false });
    await fireEvent.click(screen.getByText('top floor.png'));
    await fireEvent.click(screen.getByRole('button', { name: /move/i }));
    await fireEvent.change(screen.getByLabelText(/move to/i), { target: { value: '__top' } });
    await fireEvent.click(screen.getByRole('button', { name: /^move$/i }));
    await waitFor(() => expect(h.store.placeFile).toHaveBeenCalledWith('f2', 'p1', null, 'u1'));
  });

  it('lets only an admin delete a file, but the owner delete a folder', async () => {
    render(PackFiles, { pack, canEdit: true, isAdmin: false });
    await fireEvent.click(screen.getByText('roof.png'));
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    await fireEvent.click(screen.getByText('Plans'));
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('has no actions for a viewer', () => {
    render(PackFiles, { pack, canEdit: false, isAdmin: false });
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByText('roof.png')).toBeInTheDocument();
  });

  it('shows the template files read-only, with no actions on them but Open', async () => {
    h.store.set(state({
      inheritedFolders: [{ id: 'tf', pack_id: 'tpl', parent_id: null, name: 'New plans' }],
      inheritedFiles: [{ id: 'tfile', display_name: 'ground floor.png', mime_type: 'image/png', file_size: 5, web_view_url: 'x' }],
      inheritedPlacements: [{ document_id: 'tfile', pack_id: 'tpl', folder_id: 'tf' }],
    }));
    render(PackFiles, { pack: { ...pack, template_id: 'tpl' }, templateTitle: 'Surveyor template', canEdit: true, isAdmin: true });
    const tpl = screen.getByTestId('template-files');
    expect(tpl).toHaveTextContent('Surveyor template');
    expect(tpl).toHaveTextContent('New plans');
    expect(tpl).toHaveTextContent('ground floor.png');
    // selecting a template file offers Open and nothing that changes it
    await fireEvent.click(screen.getByText('ground floor.png'));
    expect(screen.getByRole('link', { name: /open ground floor/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /rename|delete/i }).every(b => b.disabled || !tpl.contains(b))).toBe(true);
  });

  it('says so when the template files could not be read', () => {
    h.store.set(state({ inheritedError: 'The template’s files could not be read, so pictures from the template will show as missing.' }));
    render(PackFiles, { pack: { ...pack, template_id: 'tpl' }, canEdit: true });
    expect(screen.getByTestId('template-files')).toHaveTextContent(/could not be read/);
  });

  it('has no template section for a pack with no template', () => {
    render(PackFiles, { pack, canEdit: true });
    expect(screen.queryByTestId('template-files')).toBeNull();
  });
});
