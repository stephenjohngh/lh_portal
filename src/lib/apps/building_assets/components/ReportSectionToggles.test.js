// @vitest-environment jsdom
//
// src/lib/apps/building_assets/components/ReportSectionToggles.test.js
//
// Type-2 (component DOM) test for a sub-component with TWO-WAY (bind:) props —
// the harder Phase-2 case. The key risk when extracting bound checkboxes is
// mis-wiring (binding a checkbox to the wrong prop), so the main test renders a
// DISTINCT true/false pattern and verifies each labelled checkbox reflects its
// own prop. The bind write-back itself is Svelte framework behaviour, not ours
// to test; we assert prop→DOM mapping, interactivity, and the error display.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ReportSectionToggles from './ReportSectionToggles.svelte';

const box = (re) => screen.getByRole('checkbox', { name: re });

beforeEach(cleanup);

describe('ReportSectionToggles', () => {
  it('maps each checkbox to its own prop (mis-wiring guard)', () => {
    render(ReportSectionToggles, {
      props: {
        includePlan: true,
        includeList: false,
        includeFloorSummary: true,
        includeFullSummary: false,
        includeFullComponentList: true,
      },
    });
    expect(box(/Plan Graphic/)).toBeChecked();
    expect(box(/Component Table/)).not.toBeChecked();
    expect(box(/Floor Summary/)).toBeChecked();
    expect(box(/Full Summary/)).not.toBeChecked();
    expect(box(/Full Component List/)).toBeChecked();
  });

  it('defaults every section to unchecked', () => {
    render(ReportSectionToggles, { props: {} });
    for (const re of [/Plan Graphic/, /Component Table/, /Floor Summary/, /Full Summary/, /Full Component List/]) {
      expect(box(re)).not.toBeChecked();
    }
  });

  it('toggles a checkbox on click (binding keeps the DOM in sync)', async () => {
    render(ReportSectionToggles, { props: { includeList: false } });
    const cb = box(/Component Table/);
    expect(cb).not.toBeChecked();
    await fireEvent.click(cb);
    expect(cb).toBeChecked();
  });

  it('shows the plan caption options (Asset ID / Label) only when Plan Graphic is on', () => {
    const { unmount } = render(ReportSectionToggles, { props: { includePlan: false } });
    expect(screen.queryByRole('checkbox', { name: /Asset ID/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Label$/ })).not.toBeInTheDocument();
    unmount();
    render(ReportSectionToggles, { props: { includePlan: true, planShowId: true, planShowLabel: false } });
    expect(box(/Asset ID/)).toBeChecked();
    expect(box(/^Label$/)).not.toBeChecked();
  });

  it('shows the report error when provided, and nothing when blank', () => {
    const { unmount } = render(ReportSectionToggles, { props: { reportError: 'Nothing to audit' } });
    expect(screen.getByText('Nothing to audit')).toBeInTheDocument();
    unmount();
    render(ReportSectionToggles, { props: { reportError: '' } });
    expect(screen.queryByText('Nothing to audit')).not.toBeInTheDocument();
  });
});
