// @vitest-environment jsdom
// The read-only Type Browser: fixed and condition attributes are shown under
// their own headings, and a check that applies only to some components says so.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import TypeBrowser from './TypeBrowser.svelte';

const systems = [{ id: 's1', name: 'Lighting' }];
const types = [{ id: 't1', building_system_id: 's1', name: 'Bulkhead', code: 'light_bulkhead', initial: 'L', colour: 'ffffff', priority_base: 'medium' }];
const attrDefs = {
  t1: [
    { id: 'a1', name: 'Emergency', display_type: 'checkbox', checkable: false },
    { id: 'a2', name: 'Lamp working', display_type: 'checkbox', checkable: true },
    { id: 'a3', name: 'Lit after mains off', display_type: 'checkbox', checkable: true,
      applies_when: [{ defName: 'Emergency', checkable: false, op: 'is_true' }] },
  ],
};

async function openType() {
  render(TypeBrowser, { props: { systems, types, attrDefs, attrOptions: {} } });
  await fireEvent.click(screen.getByText('Lighting'));
  await fireEvent.click(screen.getByText('Bulkhead'));
}

describe('TypeBrowser', () => {
  it('puts fixed and condition attributes under their own headings', async () => {
    await openType();
    const fixed = screen.getByTestId('attr-group-fixed');
    const condition = screen.getByTestId('attr-group-condition');
    expect(fixed.textContent).toMatch(/Fixed attributes.*\(1\)/);
    expect(condition.textContent).toMatch(/Condition attributes.*\(2\)/);
    // the fixed heading comes first
    expect(fixed.compareDocumentPosition(condition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(condition.parentElement).getByText('Lit after mains off')).toBeTruthy();
    expect(within(fixed.parentElement).queryByText('Lit after mains off')).toBeNull();
  });

  it('says when a check applies only where another attribute has a value', async () => {
    await openType();
    const notes = screen.getAllByTestId('attr-condition');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('Only where Emergency is ticked');
  });
});
