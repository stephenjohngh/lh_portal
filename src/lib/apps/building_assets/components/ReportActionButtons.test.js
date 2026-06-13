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
  it('renders the three export actions', () => {
    render(ReportActionButtons, { props: { count: 5 } });
    expect(btn(/Document/)).toBeInTheDocument();
    expect(btn(/CSV/)).toBeInTheDocument();
    expect(btn(/Condition Audit/)).toBeInTheDocument();
  });

  it('disables every action when there are no components', () => {
    render(ReportActionButtons, { props: { count: 0 } });
    expect(btn(/Document/)).toBeDisabled();
    expect(btn(/^⬇ CSV/)).toBeDisabled();
    expect(btn(/Condition Audit/)).toBeDisabled();
  });

  it('enables all actions when components exist and a section is selected', () => {
    render(ReportActionButtons, { props: { count: 5, documentDisabled: false, generating: false } });
    expect(btn(/Document/)).toBeEnabled();
    expect(btn(/^⬇ CSV/)).toBeEnabled();
    expect(btn(/Condition Audit/)).toBeEnabled();
  });

  it('disables only Document when no report section is selected (CSV stays available)', () => {
    render(ReportActionButtons, { props: { count: 5, documentDisabled: true } });
    expect(btn(/Document/)).toBeDisabled();
    expect(btn(/^⬇ CSV/)).toBeEnabled();
    expect(btn(/Condition Audit/)).toBeEnabled();
  });

  it('shows a Generating… label and disables Document while generating', () => {
    render(ReportActionButtons, { props: { count: 5, generating: true } });
    expect(btn(/Generating…/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /⬇ Document/ })).not.toBeInTheDocument();
  });

  it('dispatches the matching event when each button is clicked', async () => {
    const onDoc = vi.fn(), onCsv = vi.fn(), onAudit = vi.fn();
    render(ReportActionButtons, {
      props: { count: 5 },
      events: { document: onDoc, csv: onCsv, conditionaudit: onAudit },
    });
    await fireEvent.click(btn(/Document/));
    await fireEvent.click(btn(/^⬇ CSV/));
    await fireEvent.click(btn(/Condition Audit/));
    expect(onDoc).toHaveBeenCalledTimes(1);
    expect(onCsv).toHaveBeenCalledTimes(1);
    expect(onAudit).toHaveBeenCalledTimes(1);
  });
});
