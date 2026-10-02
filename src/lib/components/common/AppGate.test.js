// @vitest-environment jsdom
//
// AppGate — the start of every app. Holds the app back until the permission
// check AND the opening load have finished, so nothing reads as empty before
// it has been read; says "no access" in words where a grant is needed, and
// only after the check has run.

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
  };
});

vi.mock('$lib/stores/permissions', () => ({ permissions: h.permissions }));
vi.mock('$lib/stores/auth', () => ({ auth: h.auth }));

const Harness = (await import('./AppGate.harness.svelte')).default;

const body = () => screen.queryByTestId('app-body');
const NO_ACCESS = /do not have access to Demo/i;

/** A load the test finishes by hand. */
function heldLoad() {
  let finish = () => {};
  const load = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  return { load, finish: () => finish() };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.permissions.set({ loading: true, isAdmin: false });
});

describe('AppGate', () => {
  it('shows the spinner, not the app, until the check AND the load have finished', async () => {
    const { load, finish } = heldLoad();
    render(Harness, { props: { load } });
    await tick();
    expect(h.permissions.init).toHaveBeenCalledWith('u1', 'demo');
    expect(screen.getByText(/loading demo/i)).toBeInTheDocument();
    expect(body()).not.toBeInTheDocument();

    h.finishInit(false);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(body()).not.toBeInTheDocument();          // checked, still loading

    finish();
    await vi.waitFor(() => expect(body()).toBeInTheDocument());
    expect(screen.getByTestId('ready')).toHaveTextContent('ready');
  });

  it('says nothing about access while the check is running, even where a grant is needed', async () => {
    render(Harness, { props: { requireGrant: true } });
    await tick();
    expect(screen.queryByText(NO_ACCESS)).not.toBeInTheDocument();
    expect(body()).not.toBeInTheDocument();
  });

  it('tells an account without the grant so, and does not load', async () => {
    const load = vi.fn(async () => {});
    render(Harness, { props: { requireGrant: true, load } });
    await tick();
    h.finishInit(false);
    await vi.waitFor(() => expect(screen.getByText(NO_ACCESS)).toBeInTheDocument());
    expect(body()).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it('opens for a granted account and for an admin', async () => {
    render(Harness, { props: { requireGrant: true } });
    await tick();
    h.finishInit(false, { demo: { hasAccess: true } });
    await vi.waitFor(() => expect(body()).toBeInTheDocument());
    cleanup();

    h.permissions.set({ loading: true, isAdmin: false });
    render(Harness, { props: { requireGrant: true } });
    await tick();
    h.finishInit(true);
    await vi.waitFor(() => expect(body()).toBeInTheDocument());
    expect(screen.queryByText(NO_ACCESS)).not.toBeInTheDocument();
  });

  it('shows a failed load as an error, with the app still drawn beneath it', async () => {
    const load = vi.fn(async () => { throw new Error('The table could not be read'); });
    render(Harness, { props: { load } });
    await tick();
    h.finishInit(true);
    await vi.waitFor(() => expect(screen.getByText(/the table could not be read/i)).toBeInTheDocument());
    expect(body()).toBeInTheDocument();
  });

  it('draws at once when the data is already in memory', async () => {
    render(Harness, { props: { alreadyLoaded: true } });
    await tick();
    expect(body()).toBeInTheDocument();
  });

  it('does not draw early when a grant is needed, whatever it is told', async () => {
    render(Harness, { props: { alreadyLoaded: true, requireGrant: true } });
    await tick();
    expect(body()).not.toBeInTheDocument();
  });
});
