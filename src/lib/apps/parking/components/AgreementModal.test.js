// @vitest-environment jsdom
//
// AgreementModal and the price list (design §5.7). The fee is filled from the
// price for the bay's size — once. A fee the person types over must not be put
// back while they edit other fields, and the form must say it now differs.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const h = vi.hoisted(() => {
  let val = {};
  const subs = new Set();
  return {
    store: {
      subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); },
      set: (v) => { val = v; subs.forEach((r) => r(val)); },
    },
  };
});

vi.mock('../stores/parkingStore.js', () => ({
  parkingStore: { subscribe: h.store.subscribe, saveHolder: vi.fn(), createAgreement: vi.fn() },
}));

import AgreementModal from './AgreementModal.svelte';

const holder = { id: 'h1', holder_type: 'leaseholder', display_name: 'Alice Example' };
const price = { id: 't1', bay_size: 'Car', holder_class: 'all', amount: 60, period: 'month',
  vat_treatment: 'not_decided', deposit_amount: 25, effective_from: '2020-01-01', effective_to: null };
const bay = { space_id: 's22', ref: 'L/PK/22', size: 'Car', tenure: 'licensable' };

const fee = () => /** @type {HTMLInputElement} */ (screen.getByLabelText('Fee (£)'));

describe('AgreementModal fills the fee from the price list', () => {
  beforeEach(() => {
    cleanup();
    h.store.set({ holders: [holder], agreements: [], applications: [], tariffs: [price] });
  });

  it("fills the fee and deposit from the price for the bay's size, and says so", async () => {
    render(AgreementModal, { show: true, bay, presetHolderId: 'h1' });
    await tick();
    expect(fee().value).toBe('60.00');
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText('Deposit (£)')).value).toBe('25.00');
    expect(screen.getByTestId('price-note').textContent).toMatch(/From the price list/);
  });

  it('keeps a fee typed over, and says it differs from the list', async () => {
    render(AgreementModal, { show: true, bay, presetHolderId: 'h1' });
    await tick();
    await fireEvent.input(fee(), { target: { value: '45' } });
    await tick();
    // Editing another field must not put the list price back.
    await fireEvent.input(screen.getByLabelText('Notice (days)'), { target: { value: '30' } });
    await tick();
    expect(fee().value).toBe('45');
    expect(screen.getByTestId('price-note').textContent).toMatch(/Differs from the price list/);
  });

  it('says so when no price is set for the size, and leaves the fee blank', async () => {
    h.store.set({ holders: [holder], agreements: [], applications: [], tariffs: [] });
    render(AgreementModal, { show: true, bay, presetHolderId: 'h1' });
    await tick();
    expect(fee().value).toBe('');
    expect(screen.getByTestId('price-note').textContent).toMatch(/No price is set for a car bay/);
  });
});
