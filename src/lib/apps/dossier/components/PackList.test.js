// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  const mk = (init) => {
    const subs = new Set();
    let state = init;
    return { subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); }, set(v) { state = v; subs.forEach(f => f(state)); } };
  };
  const permissions = mk({ isAdmin: false, canModify: true });
  const store = mk({ packFolders: [] });
  Object.assign(store, {
    createPackFolder: vi.fn(async (f) => ({ id: 'new', ...f })), renamePackFolder: vi.fn(), movePackFolder: vi.fn(),
    deletePackFolder: vi.fn(), movePack: vi.fn(async () => ({})),
  });
  return { permissions, store };
});
vi.mock('#lib/stores/permissions.js', () => ({ permissions: h.permissions }));
vi.mock('../stores/dossierStore.js', () => ({ dossierStore: h.store }));
vi.mock('#lib/utils/currentUser.js', () => ({ currentUserId: async () => 'u1' }));

const PackList = (await import('./PackList.svelte')).default;

const packs = [
  { id: 't1', title: 'Surveyor template', is_template: true, status: 'active', created_at: '2026-01-01', folder_id: null },
  { id: 'd1', title: 'Flat 4 survey', is_template: false, template_id: 't1', status: 'active', created_at: '2026-02-01', created_by: 'u1', folder_id: 'f1' },
  { id: 'd2', title: 'Blank dossier', is_template: false, template_id: null, status: 'active', created_at: '2026-03-01', created_by: 'u1', folder_id: null },
];
const folders = [
  { id: 'f1', kind: 'dossier', name: 'Roof jobs', parent_id: null, created_by: 'u1' },
  { id: 'tf1', kind: 'template', name: 'Surveys', parent_id: null, created_by: 'a1' },
];

beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  h.permissions.set({ isAdmin: false, canModify: true });
  h.store.set({ packFolders: folders });
});

describe('PackList', () => {
  it('shows templates apart from dossiers, and says which template a dossier came from', () => {
    render(PackList, { packs });
    const templates = screen.getByTestId('section-templates');
    const dossiers = screen.getByTestId('section-dossiers');
    expect(within(templates).getByText('Surveyor template')).toBeInTheDocument();
    expect(within(dossiers).getByText('Flat 4 survey')).toBeInTheDocument();
    expect(within(dossiers).queryByText('Surveyor template')).toBeNull();
    expect(within(dossiers).getByText(/from Surveyor template/)).toBeInTheDocument();
  });

  it('shows each section as a tree: a pack sits inside its folder, an unfiled one at the top', () => {
    render(PackList, { packs });
    const dossiers = screen.getByTestId('section-dossiers');
    const rows = within(dossiers).getAllByTestId(/folder-row|pack-row/).map(r => r.textContent);
    expect(rows[0]).toMatch(/Roof jobs/);          // the folder first
    expect(rows[1]).toMatch(/Flat 4 survey/);      // its pack, under it
    expect(rows[2]).toMatch(/Blank dossier/);      // the unfiled pack last
    expect(within(dossiers).getByTestId('folder-row')).toHaveTextContent('1');   // count
  });

  it('collapsing a folder hides its packs', async () => {
    render(PackList, { packs });
    await fireEvent.click(within(screen.getByTestId('section-dossiers')).getByTitle('Collapse'));
    expect(screen.queryByText('Flat 4 survey')).toBeNull();
    expect(screen.getByText('Blank dossier')).toBeInTheDocument();
  });

  it('lets an ordinary user use a template but not edit, archive, delete or duplicate it, nor touch template folders', () => {
    render(PackList, { packs });
    const row = screen.getByText('Surveyor template').closest('[data-testid="pack-row"]');
    expect(within(row).getByRole('button', { name: 'Use' })).toBeInTheDocument();
    for (const name of ['Edit', 'Archive', 'Delete', 'Duplicate', 'Move…']) {
      expect(within(row).queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /new template/i })).toBeNull();
    expect(screen.queryByTestId('folder-toolbar-template')).toBeNull();
    expect(screen.getByTestId('folder-toolbar-dossier')).toBeInTheDocument();     // but their own dossier folders
  });

  it('lets an administrator make, edit and delete a template and its folders, but never duplicate it', () => {
    h.permissions.set({ isAdmin: true, canModify: true });
    render(PackList, { packs });
    const row = screen.getByText('Surveyor template').closest('[data-testid="pack-row"]');
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Duplicate' })).toBeNull();
    expect(screen.getByRole('button', { name: /new template/i })).toBeInTheDocument();
    expect(screen.getByTestId('folder-toolbar-template')).toBeInTheDocument();
  });

  it('starts a dossier from a template, filed in the dossier folder that is selected', async () => {
    const seen = [];
    render(PackList, { props: { packs }, events: { useTemplate: (e) => seen.push(e.detail) } });
    await fireEvent.click(screen.getByText('Roof jobs'));
    await fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(seen).toEqual([{ template: packs[0], folderId: 'f1' }]);
  });

  it('creates a folder of the right kind inside the selected one', async () => {
    render(PackList, { packs });
    const dossiers = screen.getByTestId('section-dossiers');
    await fireEvent.click(within(dossiers).getByText('Roof jobs'));
    await fireEvent.click(within(dossiers).getByRole('button', { name: '+ Folder' }));
    await fireEvent.input(screen.getByLabelText(/new folder in roof jobs/i), { target: { value: 'Flat 4' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    await waitFor(() => expect(h.store.createPackFolder).toHaveBeenCalledWith(
      { kind: 'dossier', parentId: 'f1', name: 'Flat 4' }, 'u1'));
  });

  it('refuses a folder name a sibling already has, without calling the store', async () => {
    render(PackList, { packs });
    const dossiers = screen.getByTestId('section-dossiers');
    await fireEvent.click(within(dossiers).getByRole('button', { name: '+ Folder' }));
    await fireEvent.input(screen.getByLabelText(/new folder/i), { target: { value: 'roof jobs' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    expect(await screen.findByText(/already a folder with that name/i)).toBeInTheDocument();
    expect(h.store.createPackFolder).not.toHaveBeenCalled();
  });

  it('moves a pack to the top level', async () => {
    render(PackList, { packs });
    const row = screen.getByText('Flat 4 survey').closest('[data-testid="pack-row"]');
    await fireEvent.click(within(row).getByRole('button', { name: 'Move…' }));
    await fireEvent.change(screen.getByLabelText(/move “flat 4 survey” to/i), { target: { value: '__top' } });
    await fireEvent.click(screen.getByRole('button', { name: /^move$/i }));
    await waitFor(() => expect(h.store.movePack).toHaveBeenCalledWith('d1', null, 'u1'));
  });

  it('the archived view is a flat list that says where each pack was', async () => {
    render(PackList, { packs: [{ ...packs[1], status: 'archived' }, packs[2]] });
    await fireEvent.click(screen.getByRole('button', { name: /archived \(1\)/i }));
    expect(screen.queryByTestId('folder-row')).toBeNull();
    expect(screen.getByText(/in Roof jobs/)).toBeInTheDocument();
  });
});
