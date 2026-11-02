// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('../stores/dossierStore.js', () => ({ dossierStore: { createPackFromPlan: h.create } }));
vi.mock('#lib/utils/currentUser.js', () => ({ currentUserId: async () => 'u1' }));

import ImportScriptModal from './ImportScriptModal.svelte';

const type = async (text) => fireEvent.input(screen.getByLabelText('Pack script'), { target: { value: text } });

describe('ImportScriptModal', () => {
  it('shows line-numbered errors and keeps Build disabled', async () => {
    render(ImportScriptModal, { show: true });
    await type('PACK "x"\nWIBBLE');
    expect(screen.getByTestId('script-status').textContent).toMatch(/Line 2/);
    expect(screen.getByRole('button', { name: /Build the pack/ })).toBeDisabled();
  });

  it('asks for the files a valid script names', async () => {
    render(ImportScriptModal, { show: true });
    await type('PACK "x"\nPAGE A\nIMAGE "leak.jpg"');
    const status = screen.getByTestId('script-status').textContent;
    expect(status).toMatch(/valid/);
    expect(status).toMatch(/Still to supply/);
    expect(status).toMatch(/leak\.jpg/);
    expect(screen.getByRole('button', { name: /Build the pack/ })).toBeDisabled();
  });

  it('builds a script that needs no files, and says what it made', async () => {
    h.create.mockResolvedValue({ pack: { id: 'p', title: 'x' }, counts: { pages: 1, files: 0, tables: 0 }, skipped: [] });
    render(ImportScriptModal, { show: true });
    await type('PACK "x"\nPAGE A\nTEXT "hello"');
    const btn = screen.getByRole('button', { name: /Build the pack/ });
    expect(btn).not.toBeDisabled();
    await fireEvent.click(btn);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].title).toBe('x');
    expect(await screen.findByTestId('script-made')).toBeTruthy();
  });
});
