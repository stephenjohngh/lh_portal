import { describe, it, expect } from 'vitest';
import { DISPLAY_DUTY_KEY, isDisplayDuty, displayDutyPlan } from './displayRegisterLink.js';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';

describe('displayRegisterLink', () => {
  // The link is by key, so a renamed or withdrawn register row would leave the
  // Display register pointing at nothing — silently. Read the SEED, not a copy.
  it('names a register row that exists and cites s.82', () => {
    const entry = STATUTORY_TEMPLATE.find((e) => e.key === DISPLAY_DUTY_KEY);
    expect(entry).toBeTruthy();
    expect(entry.statutoryRef).toMatch(/s\.82/);
  });

  it('recognises only the display duty', () => {
    expect(isDisplayDuty(DISPLAY_DUTY_KEY)).toBe(true);
    expect(isDisplayDuty('fra_refresh')).toBe(false);
    expect(isDisplayDuty(null)).toBe(false);
  });

  it('reports none when nothing applies the duty here', () => {
    expect(displayDutyPlan([{ template_key: 'fra_refresh', active: true }]).state).toBe('none');
    expect(displayDutyPlan(undefined).state).toBe('none');
  });

  it('reports off when the planned obligation exists but is switched off', () => {
    expect(displayDutyPlan([{ template_key: DISPLAY_DUTY_KEY, active: false }]).state).toBe('off');
  });

  it('reports on when any live planned obligation is switched on', () => {
    const r = displayDutyPlan([
      { template_key: DISPLAY_DUTY_KEY, active: false },
      { template_key: DISPLAY_DUTY_KEY, active: true },
    ]);
    expect(r.state).toBe('on');
    expect(r.planned).toHaveLength(2);
  });

  // A retired planned obligation is no longer how the duty is met; counting it
  // would say the check is scheduled when it is not.
  it('ignores a retired planned obligation', () => {
    expect(displayDutyPlan([{ template_key: DISPLAY_DUTY_KEY, active: true, retired_on: '2026-01-01' }]).state).toBe('none');
  });
});
