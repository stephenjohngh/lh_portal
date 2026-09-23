// @vitest-environment jsdom
//
// ComplianceApp — who sees what, and nothing decided before the check has run.
//
// `$permissions.isAdmin` reads false until permissions.init() resolves, so a
// shell that renders "restricted" on !isAdmin flashes that notice at the one
// admin on every open. A first-time tester reads it as a permission fault.
// These tests hold init() open and assert what is on screen meanwhile.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';

const h = vi.hoisted(() => {
  const makeStore = (init) => {
    let val = init;
    const subs = new Set();
    return {
      subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); },
      set: (v) => { val = v; subs.forEach((r) => r(val)); },
    };
  };
  const permissions = makeStore({ loading: true, isAdmin: false });
  let release = () => {};
  permissions.init = vi.fn(() => new Promise((resolve) => { release = resolve; }));
  return {
    permissions,
    finishInit: (isAdmin, grants = {}) => {
      permissions.set({ loading: false, isAdmin, appPermissions: grants });
      release();
    },
    auth: makeStore({ user: { id: 'u1' } }),
    assets: makeStore({ loading: false }),
  };
});

vi.mock('$lib/stores/permissions', () => ({ permissions: h.permissions }));
vi.mock('$lib/stores/auth', () => ({ auth: h.auth }));
vi.mock('$lib/apps/building_assets/stores/buildingAssetsStore.js', () => ({
  buildingAssetsStore: { subscribe: h.assets.subscribe, load: vi.fn(), loadComponents: vi.fn() },
}));
// vi.mock is hoisted, so it cannot be looped — one call per tab.
vi.mock('./components/ComplianceObligationsTab.svelte', async () => ({ default: (await import('./EmptyTab.harness.svelte')).default }));
vi.mock('./components/PlannedObligationsTab.svelte', async () => ({ default: (await import('./EmptyTab.harness.svelte')).default }));
vi.mock('./components/CompliancePositionTab.svelte', async () => ({ default: (await import('./EmptyTab.harness.svelte')).default }));
vi.mock('./components/DisplayRegisterTab.svelte', async () => ({ default: (await import('./EmptyTab.harness.svelte')).default }));
vi.mock('./components/InspectionWalksTab.svelte', async () => ({ default: (await import('./EmptyTab.harness.svelte')).default }));

import ComplianceApp from './ComplianceApp.svelte';

const RESTRICTED = /do not have access to Compliance/i;
const GRANTED = { compliance: { hasAccess: true, isReadOnly: false } };
const tabButton = (name) => screen.queryByRole('button', { name: new RegExp(name, 'i') });

describe('ComplianceApp admin gate', () => {
  beforeEach(() => {
    cleanup();
    h.permissions.set({ loading: true, isAdmin: false });
  });

  it('says nothing about access while the permission check is still running', async () => {
    render(ComplianceApp);
    await tick();
    expect(h.permissions.init).toHaveBeenCalled();
    expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
    expect(screen.queryByTestId('compliance-tab')).not.toBeInTheDocument();
  });

  it('opens the app for an admin once the check resolves, with no restricted notice in between', async () => {
    render(ComplianceApp);
    await tick();
    h.finishInit(true);
    await vi.waitFor(() => expect(screen.getByTestId('compliance-tab')).toBeInTheDocument());
    expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
  });

  it('refuses a non-admin who has not been granted the app', async () => {
    render(ComplianceApp);
    await tick();
    h.finishInit(false);
    await vi.waitFor(() => expect(screen.getByText(RESTRICTED)).toBeInTheDocument());
    expect(screen.queryByTestId('compliance-tab')).not.toBeInTheDocument();
  });

  // The Building Assets pattern (user, 2026-09-23): granted on Admin → Users,
  // walks visible, every register tab admin-only. "Own walks only" is the
  // walk_sessions RLS policy, so it is not asserted here.
  it('shows a granted non-admin the Inspection walks tab and nothing else', async () => {
    render(ComplianceApp);
    await tick();
    h.finishInit(false, GRANTED);
    await vi.waitFor(() => expect(screen.getByTestId('compliance-tab')).toBeInTheDocument());
    expect(tabButton('Inspection walks')).toBeInTheDocument();
    for (const t of ['Compliance obligations', 'Planned obligations', 'Compliance position', 'Display register']) {
      expect(tabButton(t), t).not.toBeInTheDocument();
    }
    expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
  });

  it('shows an admin every tab', async () => {
    render(ComplianceApp);
    await tick();
    h.finishInit(true);
    await vi.waitFor(() => expect(tabButton('Compliance obligations')).toBeInTheDocument());
    for (const t of ['Planned obligations', 'Compliance position', 'Inspection walks', 'Display register']) {
      expect(tabButton(t), t).toBeInTheDocument();
    }
  });
});
