// @vitest-environment jsdom
// src/lib/apps/maintenance/components/RecordCompletionForm.test.js
//
// ⛔ From 2026-09-10 (7bfc43c) to 2026-09-28 this form could not open for a job
// whose planned obligation has a cadence: the next-due line called addDaysISO,
// which was never imported, and the reactive statement threw on render. No job
// had ever been created, so nobody saw it — but tutorial §25 records the first
// one, and a recurring job is the ordinary case. `npm run check` runs with
// checkJs off and cannot see an undefined name.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  let val = {
    obligations: [{ id: 'o1', name: 'Fire alarm service', frequency_days: 182 }],
    docsByJob: { j1: [] },
    jobComponents: {},
  };
  const subs = new Set();
  return {
    store: {
      subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); },
      loadJobDocuments: vi.fn(async () => {}),
      loadScopeComponents: vi.fn(async () => []),
      completeJob: vi.fn(async () => {}),
    },
  };
});

vi.mock('../stores/maintenanceStore.js', () => ({ maintenanceStore: h.store }));
vi.mock('./DocumentUpload.svelte', async () => ({
  default: (await import('#lib/apps/compliance/EmptyTab.harness.svelte')).default,
}));

import RecordCompletionForm from './RecordCompletionForm.svelte';
import { addDaysISO, today } from '../utils/maintenanceHelpers.js';

describe('RecordCompletionForm', () => {
  it('opens for a recurring job and shows when the next one falls due', () => {
    render(RecordCompletionForm, {
      props: { show: true, job: { id: 'j1', obligation_id: 'o1', scope_type: 'building' } },
    });
    const next = addDaysISO(today(), 182);
    expect(screen.getAllByText(next).length).toBeGreaterThan(0);
  });
});
