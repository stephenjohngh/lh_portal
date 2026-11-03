// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  /** @type {Set<(v: any) => void>} */
  const subs = new Set();
  let state = {};
  const store = {
    subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },
    set(v) { state = v; subs.forEach(f => f(state)); },
    createFolder: vi.fn(), renameFolder: vi.fn(), moveFolder: vi.fn(), deleteFolder: vi.fn(),
    placeFile: vi.fn(async () => {}), syncFiles: vi.fn(async () => ({ moved: 1, unchanged: 0, skipped: [], failed: [] })), addFile: vi.fn(), patchFile: vi.fn(), removeFile: vi.fn(),
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
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
    await fireEvent.click(screen.getByText('Old plans'));
    expect(screen.getByRole('button', { name: /edit/i })).toBeEnabled();
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
    // the template's folders start closed: only the top-level names show
    expect(tpl).not.toHaveTextContent('ground floor.png');
    await fireEvent.click(within(tpl).getByTitle('Expand'));
    expect(tpl).toHaveTextContent('ground floor.png');
    // selecting a template file offers Open and nothing that changes it
    await fireEvent.click(screen.getByText('ground floor.png'));
    expect(screen.getByRole('link', { name: /open ground floor/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /edit|delete/i }).every(b => b.disabled || !tpl.contains(b))).toBe(true);
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

  describe('keeping Drive in step', () => {
    const inStep = (f, folderPath) => ({ ...f, folder_path: folderPath });
    const BASE = 'Dossier Packs/Surveyor brief (p1)';
    const stateInStep = () => state({
      files: [inStep(files[0], BASE), inStep(files[1], `${BASE}/Old plans (bbbbbbbb)`)],
    });
    // the pack id is 'p1' so its short id is 'p1'; the keyed folder is Plans > Old plans
    const keyed = 'Dossier Packs/Surveyor brief (p1)/Plans (aaaaaaaa)/Old plans (bbbbbbbb)';

    it('says nothing when every file is where the tree puts it', () => {
      h.store.set(state({ files: [inStep(files[0], BASE), inStep(files[1], keyed)] }));
      render(PackFiles, { pack, canEdit: true });
      expect(screen.queryByTestId('drive-status')).toBeNull();
    });

    it('counts the files not yet moved, and Sync Drive sends exactly those', async () => {
      h.store.set(state({ files: [inStep(files[0], BASE), inStep(files[1], BASE)] }));   // f2 is placed in Old plans
      render(PackFiles, { pack, canEdit: true });
      expect(screen.getByTestId('drive-status')).toHaveTextContent(/1 file is not yet in the matching Drive folder/);
      await fireEvent.click(screen.getByRole('button', { name: /sync drive/i }));
      await waitFor(() => expect(h.store.syncFiles).toHaveBeenCalledWith('p1', ['f2']));
    });

    it('moving a file to another folder brings that file into step at once', async () => {
      h.store.set(state({ files: [inStep(files[0], BASE), inStep(files[1], keyed)] }));
      render(PackFiles, { pack, canEdit: true });
      await fireEvent.click(screen.getByText('roof.png'));
      await fireEvent.click(screen.getByRole('button', { name: /move/i }));
      await fireEvent.change(screen.getByLabelText(/move to/i), { target: { value: 'bbbbbbbb-2222' } });
      await fireEvent.click(screen.getByRole('button', { name: /^move$/i }));
      await waitFor(() => expect(h.store.syncFiles).toHaveBeenCalledWith('p1', ['f1']));
    });

    it('says plainly when a file could not be moved, and keeps it counted', async () => {
      h.store.syncFiles.mockResolvedValueOnce({ moved: 0, unchanged: 0, skipped: [], failed: [{ document_id: 'f2', filename: 'x', reason: 'Drive said no' }] });
      h.store.set(state({ files: [inStep(files[0], BASE), inStep(files[1], BASE)] }));
      render(PackFiles, { pack, canEdit: true });
      await fireEvent.click(screen.getByRole('button', { name: /sync drive/i }));
      expect(await screen.findByText(/could not be moved in Drive.*Drive said no/)).toBeInTheDocument();
      expect(screen.getByTestId('drive-status')).toHaveTextContent(/not yet in the matching Drive folder/);
    });

    it('does not count a file whose storage cannot be rearranged', async () => {
      h.store.syncFiles.mockResolvedValueOnce({ moved: 0, unchanged: 0, skipped: [{ document_id: 'f2', filename: 'x', reason: 'cannot be rearranged' }], failed: [] });
      h.store.set(state({ files: [inStep(files[0], BASE), inStep(files[1], BASE)] }));
      render(PackFiles, { pack, canEdit: true });
      await fireEvent.click(screen.getByRole('button', { name: /sync drive/i }));
      await waitFor(() => expect(screen.queryByTestId('drive-status')).toBeNull());
    });

    it('shows a viewer nothing about Drive', () => {
      h.store.set(state({ files: [inStep(files[0], BASE), inStep(files[1], BASE)] }));
      render(PackFiles, { pack, canEdit: false });
      expect(screen.queryByTestId('drive-status')).toBeNull();
    });
  });
});

describe('pictures and progress', () => {
  const imgFiles = [{ id: 'f1', display_name: 'roof.png', mime_type: 'image/png', file_size: 1, web_view_url: 'https://drive.google.com/file/d/abc/view' }];
  it('offers pictures only when there are images, and shows them when switched on', async () => {
    h.store.set(state({ files: imgFiles, placements: [] }));
    render(PackFiles, { pack, canEdit: true });
    expect(screen.queryByTestId('file-thumb')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /show pictures/i }));
    expect(screen.getByTestId('file-thumb')).toBeInTheDocument();
  });
  it('has no pictures button for a pack with no images', () => {
    h.store.set(state({ files: [{ id: 'x', display_name: 'a.pdf', mime_type: 'application/pdf' }], placements: [] }));
    render(PackFiles, { pack, canEdit: true });
    expect(screen.queryByRole('button', { name: /pictures/i })).toBeNull();
  });
});

describe('dropping files onto the tree', () => {
  const dt = (...fs) => ({ dataTransfer: { types: ['Files'], files: fs } });
  const png = (n) => new File(['x'], n, { type: 'image/png' });

  it('a drop on a folder row opens the upload form aimed at that folder, with the files listed', async () => {
    render(PackFiles, { pack, canEdit: true });
    const row = screen.getAllByTestId('folder-row').find(r => r.textContent.includes('Old plans'));
    await fireEvent.drop(row, dt(png('a.png'), png('b.png')));
    expect(await screen.findByText(/^Into/)).toHaveTextContent(/Old plans/);
    expect(screen.getByTestId('selected-files')).toHaveTextContent('a.png');
    expect(screen.getByTestId('selected-files')).toHaveTextContent('b.png');
    expect(h.uploadDocument).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: /upload 2 files/i }));
    await waitFor(() => expect(h.uploadDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.store.placeFile).toHaveBeenCalledWith('n-a.png', 'p1', 'bbbbbbbb-2222', 'u1'));
  });

  it('a drop on a file row aims at that file’s folder', async () => {
    render(PackFiles, { pack, canEdit: true });
    await fireEvent.drop(screen.getByText('top floor.png').closest('[data-testid="file-row"]'), dt(png('c.png')));
    await fireEvent.click(await screen.findByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(h.store.placeFile).toHaveBeenCalledWith('n-c.png', 'p1', 'bbbbbbbb-2222', 'u1'));
  });

  it('uploads nothing for a viewer, but still stops the browser opening the file', async () => {
    render(PackFiles, { pack, canEdit: false });
    const row = screen.getAllByTestId('folder-row')[0];
    const notCancelled = await fireEvent.drop(row, dt(png('a.png')));
    expect(notCancelled).toBe(false);
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });

  it('swallows a file dropped anywhere else on the page', async () => {
    render(PackFiles, { pack, canEdit: true });
    const notCancelled = await fireEvent.drop(document.body, dt(png('a.png')));
    expect(notCancelled).toBe(false);
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });
});
