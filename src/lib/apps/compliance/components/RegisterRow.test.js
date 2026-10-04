// @vitest-environment jsdom
//
// src/lib/apps/compliance/components/RegisterRow.test.js
//
// One register row, moved out of StatutoryTemplatePanel (2026-10-03). The panel
// listens for the row's events by NAME, and a name that does not match fails
// as a button that clicks and does nothing — so each action is clicked here and
// the event the panel handles is asserted.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  const subs = new Set();
  let val = { loading: false, isAdmin: true, canModify: true, isReadOnly: false };
  return { permissions: { subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); } } };
});
vi.mock('#lib/stores/permissions.js', () => ({ permissions: h.permissions }));

const { default: RegisterRow } = await import('./RegisterRow.svelte');
const { STATUTORY_TEMPLATE } = await import('#lib/utils/statutoryTemplate.js');
const { DISPLAY_DUTY_KEY } = await import('../utils/displayRegisterLink.js');

const anEntry = STATUTORY_TEMPLATE.find((e) => e.evidencedBy && !e.suggestedScope);
const displayDuty = STATUTORY_TEMPLATE.find((e) => e.key === DISPLAY_DUTY_KEY);

/** Render a row and record every event it sends, by name. */
function row(props) {
  const sent = [];
  const events = Object.fromEntries(['toggle', 'showDisplayRegister', 'link', 'apply', 'decide', 'edit', 'withdraw']
    .map((name) => [name, (e) => sent.push([name, e.detail])]));
  render(RegisterRow, { props: { status: 'not_covered', ...props }, events });
  return sent;
}

describe('RegisterRow', () => {
  it('shows the obligation, and asks the panel to open it', async () => {
    const sent = row({ entry: anEntry });
    expect(screen.getByText(anEntry.name)).toBeTruthy();   // getByText throws if it is absent
    await fireEvent.click(screen.getByText(anEntry.name));
    expect(sent).toContainEqual(['toggle', anEntry.key]);
  });

  it('when open, its actions send the events the panel handles', async () => {
    const sent = row({ entry: anEntry, open: true, canEditRegister: true, provenance: { origin: 'local' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add to this building' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Mark not applicable' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Edit compliance obligation' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(sent).toEqual([
      ['apply', [anEntry.key]],
      ['decide', { entry: anEntry, kind: 'not_applicable' }],
      ['edit', anEntry],
      ['withdraw', anEntry],
    ]);
  });

  it('offers a candidate that may already cover it, and links it', async () => {
    const sent = row({ entry: anEntry, open: true,
                       candidates: [{ obligation: { id: 'o1', name: 'Existing check' }, reason: 'same type' }] });
    await fireEvent.click(screen.getByRole('button', { name: 'This one covers it' }));
    expect(sent).toContainEqual(['link', { obligationId: 'o1', key: anEntry.key }]);
  });

  it('the display duty links to the Display register', async () => {
    const sent = row({ entry: displayDuty, open: true });
    await fireEvent.click(screen.getByRole('button', { name: /Open the Display register/ }));
    expect(sent).toContainEqual(['showDisplayRegister', null]);
  });

  it('a not-applicable row offers Reinstate and names who decided', async () => {
    const sent = row({ entry: anEntry, status: 'not_applicable', open: true, decidedByName: 'Sam Smith',
                       decision: { reason: 'No such plant here', decided_at: '2026-09-01', decided_by: 'u1' } });
    expect(screen.getByText(/by Sam Smith/)).toBeTruthy();   // getByText throws if it is absent
    await fireEvent.click(screen.getByRole('button', { name: 'Reinstate' }));
    expect(sent).toContainEqual(['decide', { entry: anEntry, kind: 'applicable' }]);
  });

  it('carries the id the panel scrolls to', () => {
    row({ entry: anEntry });
    expect(document.getElementById(`reg-row-${anEntry.key}`)).not.toBeNull();
  });
});
