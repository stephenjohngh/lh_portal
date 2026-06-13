// @vitest-environment jsdom
// src/lib/apps/building_assets/components/ColumnToggles.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ColumnToggles from './ColumnToggles.svelte';

const box = (re) => screen.getByRole('checkbox', { name: re });
beforeEach(cleanup);

describe('ColumnToggles', () => {
  it('maps each checkbox to its own prop (mis-wiring guard)', () => {
    render(ColumnToggles, { props: { showLinked: true, showNotes: false, showInspectionNotes: true } });
    expect(box(/Linked/)).toBeChecked();
    expect(box(/^Notes/)).not.toBeChecked();
    expect(box(/Insp\. Notes/)).toBeChecked();
  });

  it('toggles on click (binding keeps the DOM in sync)', async () => {
    render(ColumnToggles, { props: { showNotes: false } });
    const cb = box(/^Notes/);
    await fireEvent.click(cb);
    expect(cb).toBeChecked();
  });
});
