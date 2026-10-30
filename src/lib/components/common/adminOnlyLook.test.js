// @vitest-environment jsdom
//
// Admin-only controls look different (user, 2026-10-30): amber on brown, so an
// administrator can see at a glance that a button is not one other people have.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('#lib/stores/permissions.js', async () => {
  const { writable } = await import('svelte/store');
  return { permissions: writable({ isAdmin: true, canModify: true, loading: false }) };
});

import ButtonSlotHarness from './adminOnlyLook.harness.svelte';

describe('admin-only look', () => {
  it('a Button marked admin is amber whatever its variant', () => {
    render(ButtonSlotHarness, { props: { kind: 'plain', admin: true, variant: 'danger' } });
    const b = screen.getByRole('button', { name: 'Go' });
    expect(b.className).toContain('bg-amber-900');
    expect(b.className).not.toContain('border-red-500');
  });

  it('an ordinary Button keeps its variant', () => {
    render(ButtonSlotHarness, { props: { kind: 'plain', admin: false, variant: 'danger' } });
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('border-red-500');
  });

  it('a ProtectedButton that requires an admin is amber, and one that does not is not', () => {
    render(ButtonSlotHarness, { props: { kind: 'protected', requireAdmin: true } });
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('bg-amber-900');
  });

  it('a ProtectedButton for editors keeps the normal look', () => {
    render(ButtonSlotHarness, { props: { kind: 'protected', requireAdmin: false } });
    expect(screen.getByRole('button', { name: 'Go' }).className).not.toContain('bg-amber-900');
  });
});
