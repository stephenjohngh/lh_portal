// @vitest-environment jsdom
//
// src/lib/apps/management/components/AddActivityForm.test.js
//
// Type-2 DOM test for the extracted add-activity form — the most coupled
// component (store + supabase + lazy editor + doc input + permissions), so the
// store/supabase/permissions seams are mocked. Covers the type-switching
// branches, the per-type structured fields, the disabled guards, and cancel.
// (The successful-submit path needs the lazy RichTextEditor's value; the
// underlying issuesStore.addActivity contract is covered in issuesStore.test.js.)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  const makeStore = (init) => {
    let v = init; const subs = new Set();
    return { subscribe: (r) => { r(v); subs.add(r); return () => subs.delete(r); }, set: (x) => { v = x; subs.forEach(r => r(v)); } };
  };
  return {
    permissions: makeStore({ loading: false, isAdmin: true, canModify: true, isReadOnly: false }),
    addActivity: vi.fn(() => Promise.resolve({ success: true })),
  };
});

vi.mock('$lib/stores/permissions', () => ({ permissions: h.permissions }));
vi.mock('../stores/issuesStore', () => ({ issuesStore: { addActivity: h.addActivity } }));
vi.mock('$lib/supabaseClient', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) } },
}));
vi.mock('$lib/utils/authHeaders', () => ({ authHeaders: () => Promise.resolve({ 'Content-Type': 'application/json' }) }));

const AddActivityForm = (await import('./AddActivityForm.svelte')).default;
const btn = (re) => screen.getByRole('button', { name: re });

beforeEach(() => { vi.clearAllMocks(); cleanup(); });

describe('AddActivityForm', () => {
  it('defaults to a Note and disables Add while the body is empty', () => {
    render(AddActivityForm, { props: { issueId: 'i1' } });
    expect(btn(/Add Note/)).toBeInTheDocument();
    expect(btn(/Add Note/)).toBeDisabled();
  });

  it('switching to Email reveals the email structured fields and relabels Add', async () => {
    render(AddActivityForm, { props: { issueId: 'i1' } });
    await fireEvent.click(btn(/Email/));   // unique while Add still says "Add Note"
    expect(btn(/Add Email/)).toBeInTheDocument();
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
  });

  it('switching to Document shows the required file attach + a disabled Add (no file yet)', async () => {
    render(AddActivityForm, { props: { issueId: 'i1' } });
    await fireEvent.click(btn(/Document/));
    expect(screen.getByText(/Attach file/)).toBeInTheDocument();
    expect(btn(/Add Document/)).toBeDisabled();   // disabled until a file is chosen
  });

  it('Cancel dispatches a cancel event', async () => {
    const onCancel = vi.fn();
    render(AddActivityForm, { props: { issueId: 'i1' }, events: { cancel: onCancel } });
    await fireEvent.click(btn(/^Cancel$/));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
