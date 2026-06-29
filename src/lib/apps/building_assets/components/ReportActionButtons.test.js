// @vitest-environment jsdom
//
// src/lib/apps/building_assets/components/ReportActionButtons.test.js
//
// Type-2 (component DOM) test for a sub-component extracted from ComponentsTab
// — the Phase-2 worked example. Presentational + event-only, so no store mocks
// are needed: render with props, query by role, assert disabled state + events.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ReportActionButtons from './ReportActionButtons.svelte';

const btn = (re) => screen.getByRole('button', { name: re });

beforeEach(cleanup);

describe('ReportActionButtons', () => {
  it('renders the three export actions (Word + Excel + CSV)', () => {
    render(ReportActionButtons, { props: { count: 5 } });
    expect(btn(/^⬇ Word/)).toBeInTheDocument();
    expect(btn(/^⬇ Excel/)).toBeInTheDocument();
    expect(btn(/^⬇ CSV/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Condition Audit/ })).not.toBeInTheDocument();
  });

  it('disables every action when there are no components', () => {
    render(ReportActionButtons, { props: { count: 0 } });
    expect(btn(/^⬇ Word/)).toBeDisabled();
    expect(btn(/^⬇ Excel/)).toBeDisabled();
    expect(btn(/^⬇ CSV/)).toBeDisabled();
  });

  it('enables all actions when components exist and a section is selected', () => {
    render(ReportActionButtons, { props: { count: 5, documentDisabled: false, generating: false } });
    expect(btn(/^⬇ Word/)).toBeEnabled();
    expect(btn(/^⬇ Excel/)).toBeEnabled();
    expect(btn(/^⬇ CSV/)).toBeEnabled();
  });

  it('disables only Word when no report section is selected (Excel + CSV stay available)', () => {
    render(ReportActionButtons, { props: { count: 5, documentDisabled: true } });
    expect(btn(/^⬇ Word/)).toBeDisabled();
    expect(btn(/^⬇ Excel/)).toBeEnabled();
    expect(btn(/^⬇ CSV/)).toBeEnabled();
  });

  it('shows a Generating… label and disables Word while it generates', () => {
    render(ReportActionButtons, { props: { count: 5, generating: true } });
    expect(screen.queryByRole('button', { name: /⬇ Word/ })).not.toBeInTheDocument();
    expect(btn(/Generating…/)).toBeDisabled();
  });

  it('dispatches the matching event when each button is clicked', async () => {
    const onDoc = vi.fn(), onXlsx = vi.fn(), onCsv = vi.fn();
    render(ReportActionButtons, {
      props: { count: 5 },
      events: { document: onDoc, xlsx: onXlsx, csv: onCsv },
    });
    await fireEvent.click(btn(/^⬇ Word/));
    await fireEvent.click(btn(/^⬇ Excel/));
    await fireEvent.click(btn(/^⬇ CSV/));
    expect(onDoc).toHaveBeenCalledTimes(1);
    expect(onXlsx).toHaveBeenCalledTimes(1);
    expect(onCsv).toHaveBeenCalledTimes(1);
  });
});
