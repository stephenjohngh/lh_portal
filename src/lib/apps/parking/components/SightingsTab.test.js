// @vitest-environment jsdom
//
// Parking → Unauthorised parking (migration 245): every sighting, how many
// times each car has been seen, who recorded it; delete is for admins only.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ isAdmin: false }));
const store = (val) => ({ subscribe: (run) => { run(val); return () => {}; } });
vi.mock('../stores/sightingStore.js', () => ({ sightingStore: {
  ...store({ error: null, sightings: [
    { id: 's2', registration: 'XCVB675', place: 'road', seen_at: '2026-10-12T08:00:00Z', notes: 'again', created_by: 'u1', photos: [] },
    { id: 's1', registration: 'XCVB675', place: 'car_park', seen_at: '2026-10-10T08:00:00Z', notes: 'first', created_by: 'u1', photos: ['https://drive.google.com/uc?export=view&id=abc'] },
    { id: 's3', registration: 'AB12CDE', place: 'road', seen_at: '2026-10-11T08:00:00Z', notes: null, created_by: null, photos: [] },
  ] }),
  load: async () => {}, remove: vi.fn(),
} }));
vi.mock('#lib/stores/profiles.js', () => ({ profiles: store({ list: [{ id: 'u1', full_name: 'Caretaker' }] }), profilesStore: { load: async () => {} } }));
vi.mock('#lib/stores/permissions.js', () => ({ permissions: { subscribe: (run) => { run({ isAdmin: h.isAdmin }); return () => {}; } } }));

const SightingsTab = (await import('./SightingsTab.svelte')).default;
beforeEach(() => cleanup());

describe('Unauthorised parking tab', () => {
  it('lists every sighting with how often the car was seen, and who recorded it', async () => {
    h.isAdmin = false;
    render(SightingsTab);
    const table = await screen.findByTestId('sightings-table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(table.textContent).toMatch(/seen 2×/);
    expect(table.textContent).toMatch(/Caretaker/);
    expect(table.querySelectorAll('img')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
  it('an admin may delete', async () => {
    h.isAdmin = true;
    render(SightingsTab);
    await screen.findByTestId('sightings-table');
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(3);
  });
});
