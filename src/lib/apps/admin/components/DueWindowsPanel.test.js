// @vitest-environment jsdom
//
// src/lib/apps/admin/components/DueWindowsPanel.test.js
// Admin → Due windows. Behaviour only: one row per window, Save only once
// something has changed, a value out of range blocks it, and what is saved and
// audited is what was typed.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  const makeStore = (init) => {
    let val = init;
    const subs = new Set();
    return {
      subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); },
      set: (v) => { val = v; subs.forEach((r) => r(val)); },
      get: () => val,
    };
  };
  return {
    makeStore,
    permissions: makeStore({ loading: false, isAdmin: true, canModify: true, isReadOnly: false }),
    settings: /** @type {any} */ (null),
    logAudit: vi.fn(),
  };
});

vi.mock('#lib/stores/permissions.js', () => ({ permissions: h.permissions }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: h.logAudit }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/stores/portalSettings.js', async () => {
  const { DUE_SOON_DEFAULTS, cleanDueWindows } = await import('#lib/utils/dueWindows.js');
  const store = h.makeStore({ loaded: true, dueWindows: {}, windows: { ...DUE_SOON_DEFAULTS } });
  h.settings = {
    subscribe: store.subscribe,
    load: vi.fn(() => Promise.resolve()),
    saveDueWindows: vi.fn(async (w) => {
      const changed = cleanDueWindows(w);
      store.set({ ...store.get(), dueWindows: changed, windows: { ...DUE_SOON_DEFAULTS, ...changed } });
      return changed;
    }),
    reset: () => store.set({ loaded: true, dueWindows: {}, windows: { ...DUE_SOON_DEFAULTS } }),
  };
  return { portalSettings: h.settings };
});

const { dueWindowInfo } = await import('#lib/utils/dueWindows.js');
const DueWindowsPanel = (await import('./DueWindowsPanel.svelte')).default;

const jobInput = () => screen.getByLabelText('A scheduled maintenance job — days');
const saveButton = () => screen.getByRole('button', { name: /save changes/i });

beforeEach(async () => {
  cleanup();
  vi.clearAllMocks();
  h.settings.reset();
  render(DueWindowsPanel);
  await waitFor(() => expect(jobInput()).toBeInTheDocument());
});

describe('DueWindowsPanel', () => {
  it('shows every window with its default', () => {
    for (const w of dueWindowInfo()) {
      expect(screen.getByLabelText(`${w.label} — days`)).toHaveValue(w.defaultDays);
    }
    expect(screen.getByText(/every window is on its default/i)).toBeInTheDocument();
  });

  it('offers Save only once something has changed', async () => {
    expect(saveButton()).toBeDisabled();
    await fireEvent.input(jobInput(), { target: { value: '45' } });
    expect(saveButton()).toBeEnabled();
  });

  it('refuses a value out of range, and says why', async () => {
    await fireEvent.input(jobInput(), { target: { value: '-3' } });
    expect(screen.getByText(/a whole number from 0 to 3650/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saves what was typed, and audits the change', async () => {
    await fireEvent.input(jobInput(), { target: { value: '45' } });
    await fireEvent.click(saveButton());
    await waitFor(() => expect(h.settings.saveDueWindows).toHaveBeenCalled());
    expect(h.settings.saveDueWindows.mock.calls[0][0]).toMatchObject({ maintenanceJob: 45, certificateExpiry: 60 });
    await waitFor(() => expect(h.logAudit).toHaveBeenCalledWith(
      'update', 'portal_setting', 'due_soon_days', 'Due windows',
      expect.objectContaining({ beforeData: { windows: {} }, afterData: { windows: { maintenanceJob: 45 } } }),
    ));
    expect(await screen.findByText(/✓ saved/i)).toBeInTheDocument();
  });

  it('puts a changed window back to its default', async () => {
    await fireEvent.input(jobInput(), { target: { value: '45' } });
    await fireEvent.click(screen.getByRole('button', { name: /use default/i }));
    expect(jobInput()).toHaveValue(30);
    expect(saveButton()).toBeDisabled();
  });
});
