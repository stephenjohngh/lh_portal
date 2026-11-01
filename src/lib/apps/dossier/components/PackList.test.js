// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  const subs = new Set();
  let state = { isAdmin: false, canModify: true };
  return {
    permissions: {
      subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },
      set(v) { state = v; subs.forEach(f => f(state)); },
    },
  };
});
vi.mock('#lib/stores/permissions.js', () => ({ permissions: h.permissions }));

const PackList = (await import('./PackList.svelte')).default;

const packs = [
  { id: 't1', title: 'Surveyor template', is_template: true, status: 'active', created_at: '2026-01-01' },
  { id: 'd1', title: 'Flat 4 survey', is_template: false, template_id: 't1', status: 'active', created_at: '2026-02-01' },
  { id: 'd2', title: 'Blank dossier', is_template: false, template_id: null, status: 'active', created_at: '2026-03-01' },
];

beforeEach(() => { cleanup(); h.permissions.set({ isAdmin: false, canModify: true }); });

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

  it('lets an ordinary user use a template but not edit, archive, delete or duplicate it', () => {
    render(PackList, { packs });
    const row = screen.getByText('Surveyor template').closest('div[class*="group"]');
    expect(within(row).getByRole('button', { name: 'Use' })).toBeInTheDocument();
    for (const name of ['Edit', 'Archive', 'Delete', 'Duplicate']) {
      expect(within(row).queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /new template/i })).toBeNull();
  });

  it('lets an administrator make, edit and delete a template, but never duplicate it', () => {
    h.permissions.set({ isAdmin: true, canModify: true });
    render(PackList, { packs });
    const row = screen.getByText('Surveyor template').closest('div[class*="group"]');
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Duplicate' })).toBeNull();
    expect(screen.getByRole('button', { name: /new template/i })).toBeInTheDocument();
  });

  it('starts a dossier from a template with the template as the detail', async () => {
    const seen = [];
    render(PackList, { props: { packs }, events: { useTemplate: (e) => seen.push(e.detail.id) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(seen).toEqual(['t1']);
  });
});
