// src/routes/api/reports/generate-ten-year-plan/server.test.js
//
// Smoke-tests the docx assembly: build the plan document from a real payload and
// confirm it packs to a non-trivial .docx buffer. Catches structural mistakes
// (bad cell/column counts, misused paragraph/heading helpers) without needing an
// authenticated request. Node env — docx runs server-side.

import { describe, it, expect, vi } from 'vitest';
import { Packer } from 'docx';

// The route imports requireAuth, which reads $env at module load. Stub them as
// virtual modules (blueprint pattern) — the doc builder never touches auth/env.
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://localhost', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' } }));
vi.mock('$app/environment', () => ({ browser: false, dev: false, building: false }));

import { _buildPlanDocument } from './+server.js';
import { buildPlanReportPayload } from '$lib/apps/maintenance/utils/planReport.js';
import { buildTenYearForecast } from '$lib/apps/maintenance/utils/tenYearPlan.js';

function samplePayload() {
  const groups = [
    { id: 'a', name: 'Lift',   last_renewal_date: '2020-06-01', lifetime_years: 10, expected_cost: 50000, notes: 'Otis 2000 model' },
    { id: 'b', name: 'Boiler', last_renewal_date: '2025-01-01', lifetime_years: 3,  expected_cost: 9000,  notes: '' },
    { id: 'c', name: 'Reserve contingency', last_renewal_date: '2024-01-01', lifetime_years: 1, expected_cost: 5000, notes: 'Manual line' },
  ];
  const membership = {
    a: { total: 2, byStatus: { ok: 1, problem: 0, failed: 1, inactive: 0 }, attention: 1, manual: false },
    b: { total: 1, byStatus: { ok: 1, problem: 0, failed: 0, inactive: 0 }, attention: 0, manual: false },
    c: { total: 0, byStatus: { ok: 0, problem: 0, failed: 0, inactive: 0 }, attention: 0, manual: true },
  };
  const forecast = buildTenYearForecast(groups, { startYear: 2026, years: 10 });
  return buildPlanReportPayload(forecast, membership, groups, { building: 'Lonsdale House', generatedAt: '22 Jul 2026' });
}

describe('_buildPlanDocument', () => {
  it('packs a populated plan to a real .docx buffer', async () => {
    const buffer = await Packer.toBuffer(_buildPlanDocument(samplePayload()));
    expect(buffer.length).toBeGreaterThan(2000);
    // .docx is a ZIP — starts with "PK".
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('packs an empty plan (no groups) without throwing', async () => {
    const forecast = buildTenYearForecast([], { startYear: 2026, years: 10 });
    const payload  = buildPlanReportPayload(forecast, {}, [], { building: 'LH', generatedAt: '22 Jul 2026' });
    const buffer   = await Packer.toBuffer(_buildPlanDocument(payload));
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
