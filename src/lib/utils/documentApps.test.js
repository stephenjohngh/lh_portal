import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOCUMENT_APPS, documentAppLabel, entityTypesForApp, UNATTACHED } from './documentApps.js';

describe('documentApps', () => {
  it('names the app of a row, and a row attached to nothing', () => {
    expect(documentAppLabel('dossier_pack')).toBe('Dossier');
    expect(documentAppLabel('parking_permit_template')).toBe('Parking');
    expect(documentAppLabel(null)).toBe('Not attached');
    expect(documentAppLabel('something_new')).toBe('something_new');
  });
  it('gives the entity types of an app, and none for an unknown key', () => {
    expect(entityTypesForApp('parking')).toEqual(['parking_agreement', 'parking_permit_template']);
    expect(entityTypesForApp('nope')).toBeNull();
    expect(entityTypesForApp(UNATTACHED)).toBeNull();
  });
  it('covers every entity type the library permits', () => {
    const src = readFileSync('src/lib/server/documentAccess.js', 'utf8');
    const block = src.slice(src.indexOf('ENTITY_PARENT_TABLE'));
    const known = [...block.slice(0, block.indexOf('}')).matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
    expect(known.length).toBeGreaterThan(5);
    const mapped = new Set(DOCUMENT_APPS.flatMap((a) => a.types));
    expect(known.filter((t) => !mapped.has(t))).toEqual([]);
  });
});
