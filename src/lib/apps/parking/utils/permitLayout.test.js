import { describe, it, expect } from 'vitest';
import { permitLayout, PAGE, TOP_HEIGHT } from './permitLayout.js';

const permit = { permit_number: 100, company: 'Acme Scaffolding Ltd', registration: 'AB12 CDE',
  valid_from_time: '07:00:00', valid_to_time: '19:00:00',
  valid_from: '2026-10-06', valid_to: '2026-10-12', issued_by: 'J Smith' };
const template = { title: 'Parking Permit', location: 'Side road', conditions: 'Display on the dashboard.' };
const building = { name: 'Lancaster House', address: '71 Whitworth St\nManchester' };

const texts = (steps) => steps.filter((s) => s.type === 'text');
const allText = (steps) => texts(steps).map((s) => s.text).join('\n');

describe('permitLayout', () => {
  it('is A4 at 300 dpi, the bottom third left to the fixed image', () => {
    expect(PAGE).toEqual({ width: 2480, height: 3508 });
    expect(TOP_HEIGHT).toBe(2339);
    const steps = permitLayout(permit, template, building);
    expect(steps.find((s) => s.type === 'image' && s.which === 'footer'))
      .toMatchObject({ y: TOP_HEIGHT, h: PAGE.height - TOP_HEIGHT, fit: 'contain' });
    expect(steps.find((s) => s.type === 'image' && s.which === 'background'))
      .toMatchObject({ y: 0, h: TOP_HEIGHT, fit: 'cover' });
  });

  it('writes nothing over the bottom third, even at full size and every line used', () => {
    for (const s of texts(permitLayout(permit, template, building))) {
      const bottom = s.y + s.size * 1.25 * (s.maxLines ?? 1);
      expect(bottom, s.text).toBeLessThanOrEqual(TOP_HEIGHT);
    }
  });

  it('keeps every line inside the page edges', () => {
    for (const s of texts(permitLayout(permit, template, building))) {
      const left = s.align === 'center' ? s.x - s.maxWidth / 2 : s.x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + s.maxWidth).toBeLessThanOrEqual(PAGE.width);
    }
  });

  it('prints every detail of the permit, and the building from the admin setting', () => {
    const t = allText(permitLayout(permit, template, building));
    for (const s of ['Lancaster House', '71 Whitworth St, Manchester', 'Parking Permit', 'Side road',
      'Acme Scaffolding Ltd', 'AB12 CDE', '06 Oct 2026, 07:00', '12 Oct 2026, 19:00', 'J Smith', 'Permit number: 100',
      'Display on the dashboard.']) {
      expect(t).toContain(s);
    }
  });

  it('leaves out an empty location, address and small print rather than printing a blank line', () => {
    const steps = permitLayout(permit, { title: '' }, { name: 'X' });
    expect(texts(steps).every((s) => s.text.trim() !== '')).toBe(true);
    expect(allText(steps)).toContain('Parking Permit');   // the default title
  });
});
