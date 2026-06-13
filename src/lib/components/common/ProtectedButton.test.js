// @vitest-environment jsdom
//
// src/lib/components/common/ProtectedButton.test.js
//
// TYPE-2 (component DOM/interaction) test — the canonical harness. Copy this
// shape for other component tests. See CLAUDE.md "Testing".
//
// Conventions that keep these tests from going brittle:
//   • The jsdom environment is opted into per-file via the docblock above.
//   • Stores are mocked through a tiny reactive store built in vi.hoisted()
//     (vi.mock factories hoist above imports, so we can't import `writable`
//     there — this hand-rolled store supports .set() with subscriber notify).
//   • Assertions are about BEHAVIOUR (is it in the document? does it dispatch
//     the event?), queried by ROLE — never by CSS class or DOM structure.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';

// ── Reusable store-mock helper (lift into a shared testkit when a 2nd
//    component test needs it). A minimal writable: set() notifies subscribers.
const h = vi.hoisted(() => {
  const makeStore = (init) => {
    let val = init;
    const subs = new Set();
    return {
      subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); },
      set: (v) => { val = v; subs.forEach((r) => r(val)); },
    };
  };
  return { permissions: makeStore({ loading: false, isAdmin: false, canModify: false, isReadOnly: false }) };
});

vi.mock('$lib/stores/permissions', () => ({ permissions: h.permissions }));

const ProtectedButton = (await import('./ProtectedButton.svelte')).default;

const setPerms = (over) => h.permissions.set({ loading: false, isAdmin: false, canModify: false, isReadOnly: false, ...over });

beforeEach(() => {
  cleanup();
  setPerms({});
});

describe('ProtectedButton (rendering + interaction)', () => {
  it('renders a clickable button for an admin and forwards the click event', async () => {
    setPerms({ isAdmin: true });
    const onClick = vi.fn();
    render(ProtectedButton, { props: { action: 'modify', requireAdmin: true }, events: { click: onClick } });

    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    await fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render a modify action for a read-only (non-admin) user', () => {
    setPerms({ isAdmin: false, canModify: false, isReadOnly: true });
    render(ProtectedButton, { props: { action: 'modify' } });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a view action for a non-admin user', () => {
    setPerms({ isAdmin: false, canModify: false });
    render(ProtectedButton, { props: { action: 'view' } });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('hides an admin-required action from a non-admin', () => {
    setPerms({ isAdmin: false, canModify: true });
    render(ProtectedButton, { props: { action: 'modify', requireAdmin: true } });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a modify action once the user gains modify permission (reactive)', () => {
    setPerms({ canModify: true });
    render(ProtectedButton, { props: { action: 'modify' } });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
