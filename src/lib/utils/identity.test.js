// src/lib/utils/identity.test.js
// The building and the business are admin settings (Admin → Other Config →
// Building & business), never code. They used to be written into ~30 files —
// "Lonsdale House" in some exports, "Lancaster House" in others, the letters
// signed "[Building Safety Manager name]" every time. User, 2026-10-03.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ORGANISATION_FIELDS, cleanOrganisation, organisationOrPlaceholders, buildingName } from './identity.js';

describe('identity', () => {
  it('an unset building prints as a placeholder, never a guessed name', () => {
    expect(buildingName(null)).toBe('[Building name]');
    expect(buildingName({ name: '   ' })).toBe('[Building name]');
    expect(buildingName({ name: ' Riverside Court ' })).toBe('Riverside Court');
  });

  it('keeps only the known fields, trimmed; an emptied field reads as unset', () => {
    expect(cleanOrganisation({ name: ' Acme ', email: '', stray: 'x' })).toEqual({ name: 'Acme' });
    expect(cleanOrganisation(null)).toEqual({});
  });

  it('every field has its placeholder when unset', () => {
    const o = organisationOrPlaceholders({ signatoryName: 'Sam Smith' });
    expect(o.signatoryName).toBe('Sam Smith');
    for (const f of ORGANISATION_FIELDS) expect(o[f.key]).toBeTruthy();
    expect(o.signatoryContact).toMatch(/^\[/);
  });
});

describe('no building or business is named in code', () => {
  // Comments may record the history; code may not carry the names. The logo's
  // description is deployment branding and lives in $lib/branding.js only.
  const NAMES = /Lonsdale House|Lancaster House|LH Services|LH Portal/;
  const stripComments = (src) => src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

  it('only branding.js names the brand', () => {
    const walk = (d, o = []) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p, o);
        else if (/\.(js|svelte)$/.test(n) && !/\.test\.js$/.test(n)) o.push(p);
      }
      return o;
    };
    const root = join(process.cwd(), 'src');
    const bad = walk(root)
      .map((p) => relative(root, p).replace(/\\/g, '/'))
      .filter((rel) => rel !== 'lib/branding.js')
      .filter((rel) => NAMES.test(stripComments(readFileSync(join(root, rel), 'utf8'))));
    expect(bad, 'read the building and business from Admin → Building & business (portalSettings / getIdentity)').toEqual([]);
  });
});
