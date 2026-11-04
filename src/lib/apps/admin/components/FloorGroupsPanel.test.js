// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ saved: /** @type {any[]} */ ([]), deleted: /** @type {any[]} */ ([]) }));
vi.mock('#lib/apps/building_assets/public.js', () => ({
  saveFloorGroup: async (/** @type {any} */ g) => { h.saved.push(g); return g.id ?? 'new-id'; },
  deleteFloorGroup: async (/** @type {any} */ id) => { h.deleted.push(id); },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));

const Panel = (await import('./FloorGroupsPanel.svelte')).default;
const floors = [{ id: 'fL', name: 'Lower Basement', short_name: 'L' }, { id: 'fU', name: 'Upper Basement', short_name: 'U' }];
const groups = [{ id: 'b', name: 'Basement', position: 10, floorIds: ['fL'] }];

beforeEach(() => { cleanup(); h.saved = []; h.deleted = []; });

describe('Admin → Floor groups', () => {
  it('ticks a floor into a group and saves name and floors together', async () => {
    render(Panel, { groups, floors });
    await fireEvent.click(screen.getByLabelText('Upper Basement (U)'));
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0]).toMatchObject({ id: 'b', name: 'Basement' });
    expect(h.saved[0].floorIds.sort()).toEqual(['fL', 'fU']);
    expect(await screen.findByRole('status')).toHaveTextContent('Basement saved.');
  });

  it('a new group can be named anything but a name already used', async () => {
    render(Panel, { groups, floors });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a group' }));
    const name = screen.getAllByLabelText(/Name/)[1];
    await fireEvent.input(name, { target: { value: 'basement' } });
    expect(await screen.findByText(/already a group/)).toBeTruthy();
    await fireEvent.input(name, { target: { value: 'External' } });
    const save = screen.getAllByRole('button', { name: 'Save' })[1];
    await waitFor(() => expect(save).not.toBeDisabled());
    await fireEvent.click(save);
    await waitFor(() => expect(h.saved[0]).toMatchObject({ id: null, name: 'External' }));
  });

  it('delete asks first', async () => {
    render(Panel, { groups, floors });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(h.deleted).toEqual([]);
    expect(await screen.findByText(/floors and components are not changed/)).toBeTruthy();
  });
});
