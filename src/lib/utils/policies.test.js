// src/lib/utils/policies.test.js
// The policy numbers are admin settings (Admin → Other Config → Policies,
// 2026-10-04). Pins: the shipped defaults ARE the numbers the code used, so
// nothing changes until an admin chooses; bounds keep a control a control;
// banded groups stay in order; and the module rule — read when used, never
// captured at module scope — with every policy actually read somewhere.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  policyInfo, POLICY_DEFAULTS, cleanPolicies, validatePolicies, setPolicies,
  policy, rateLimit, RATE_LIMIT_WINDOWS,
} from './policies.js';

afterEach(() => setPolicies(null));

describe('shipped defaults are the numbers the code used', () => {
  it('nothing changes until an admin chooses', () => {
    expect(POLICY_DEFAULTS).toMatchObject({
      loginFailuresPerAddress: 5, loginFailuresPerAccount: 20, loginPauseMinutes: 15,
      fileAccessHours: 12, morPhotosPerReport: 5, parkingOfferDays: 14, dossierRevisionsKept: 20,
      gtReviewBand1: 30, gtReviewBand2: 60, gtReviewBand3: 90,
      gtRiskLowMax: 4, gtRiskMediumMax: 9, gtRiskHighMax: 15,
      rate_photo_upload: 10, rate_case_submit: 3, rate_status_lookup: 10, rate_ai_suggest: 60,
      rate_ai_summary: 60, rate_pack_read: 120, rate_pack_asset: 300, rate_pack_unlock: 10, rate_pack_archive: 10,
    });
  });

  it('every default is within its own bounds', () => {
    for (const p of policyInfo()) expect(p.default >= p.min && p.default <= p.max, p.key).toBe(true);
  });
});

describe('storing and reading', () => {
  it('stores only what differs from the default', () => {
    expect(cleanPolicies({ parkingOfferDays: 21, dossierRevisionsKept: 20, unknown: 3 })).toEqual({ parkingOfferDays: 21 });
  });

  it('a value in force is read when asked for', () => {
    setPolicies({ parkingOfferDays: 21 });
    expect(policy('parkingOfferDays')).toBe(21);
    expect(policy('dossierRevisionsKept')).toBe(20);
    setPolicies(null);
    expect(policy('parkingOfferDays')).toBe(14);
  });

  it('a rate limit keeps its window and takes the admin number', () => {
    setPolicies({ rate_pack_unlock: 5 });
    expect(rateLimit('pack_unlock')).toEqual({ max: 5, windowMinutes: RATE_LIMIT_WINDOWS.pack_unlock.windowMinutes });
    expect(rateLimit('nope')).toBeNull();
  });
});

describe('a control stays a control', () => {
  it('refuses a value outside its bounds', () => {
    expect(validatePolicies({ loginFailuresPerAddress: 0 })).toHaveProperty('loginFailuresPerAddress');
    expect(validatePolicies({ rate_pack_unlock: 100000 })).toHaveProperty('rate_pack_unlock');
    expect(validatePolicies({ parkingOfferDays: 2.5 })).toHaveProperty('parkingOfferDays');
  });

  it('banded groups must rise in order', () => {
    expect(validatePolicies({ gtReviewBand2: 20 })).toHaveProperty('gtReviewBand2');
    expect(validatePolicies({ gtRiskMediumMax: 16 })).toHaveProperty('gtRiskHighMax');
    expect(validatePolicies({ gtReviewBand1: 14, gtReviewBand2: 28, gtReviewBand3: 56 })).toEqual({});
  });

  it('a stored group out of order is ignored as a whole, never half-applied', () => {
    setPolicies({ gtReviewBand1: 50, gtReviewBand2: 40 });
    expect([policy('gtReviewBand1'), policy('gtReviewBand2'), policy('gtReviewBand3')]).toEqual([30, 60, 90]);
  });
});

describe('read when used', () => {
  const root = join(process.cwd(), 'src');
  const walk = (d, o = []) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, o);
      else if (/\.(js|svelte)$/.test(n) && !/\.test\.js$/.test(n)) o.push(p);
    }
    return o;
  };
  const files = walk(root).map((p) => ({ rel: relative(root, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));

  it('no file captures a policy once, at module scope', () => {
    // A top-level `const X = policy(…)` reads before the setting arrives and
    // keeps the default for the life of the page.
    const bad = files.filter((f) => /^(export )?const \w+\s*=\s*(policy|rateLimit)\(/m.test(f.src)).map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it('every policy an admin can set is read somewhere', () => {
    const code = files.filter((f) => f.rel !== 'lib/utils/policies.js').map((f) => f.src).join('\n');
    const unread = policyInfo()
      .filter((p) => !p.key.startsWith('rate_'))   // read through rateLimit(action)
      .filter((p) => !code.includes(`'${p.key}'`))
      .map((p) => p.key);
    expect(unread, 'a setting nothing reads is a promise the screen does not keep').toEqual([]);
  });
});
