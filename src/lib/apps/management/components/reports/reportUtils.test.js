// src/lib/apps/management/components/reports/reportUtils.test.js
//
// buildFieldSummary is the line an activity shows on screen, in the minutes and
// in both Word reports. It READS what the activity forms WRITE, and the two had
// drifted: email read `notes` (no form writes it) and letter and meeting read no
// summary at all — so the "one-line summary for reports" a person typed never
// reached a report (2026-10-03, PROJECT_STATUS §6ccc item 1). So the test takes
// each type's fields from the form's own configuration rather than a list here:
// a field added to a form is checked without anyone remembering to.

import { describe, it, expect } from 'vitest';
import { buildFieldSummary } from './reportUtils.js';
import { ACTIVITY_TYPE_CONFIG } from '#lib/utils/constants.js';

const sample = (field) =>
  field.type === 'date' ? '2026-09-01'
  : field.type === 'select' ? (field.options?.[0]?.value ?? 'x')
  : `sample ${field.key}`;

describe('buildFieldSummary — every field a form asks for is shown', () => {
  for (const [type, cfg] of Object.entries(ACTIVITY_TYPE_CONFIG)) {
    for (const field of cfg.fields ?? []) {
      it(`${type}: "${field.key}" on its own appears in the line`, () => {
        const line = buildFieldSummary(type, { [field.key]: sample(field) });
        expect(line, `${type}.${field.key} is collected by the form and shown nowhere`).not.toBe('');
        if (field.type !== 'date' && field.type !== 'select') expect(line).toContain(sample(field));
      });
    }
  }

  it('leads with the summary where there is one', () => {
    expect(buildFieldSummary('email', { summary: 'Quote accepted', from: 'a', to: 'b' }))
      .toMatch(/^Quote accepted · /);
  });

  it('is empty when nothing was filled in', () => {
    for (const type of Object.keys(ACTIVITY_TYPE_CONFIG)) expect(buildFieldSummary(type, {})).toBe('');
  });
});
