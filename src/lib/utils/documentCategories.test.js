// src/lib/utils/documentCategories.test.js
// The document categories are an admin setting (2026-10-04). Pins: the shipped
// list is in force until changed; renamed, added and retired are stored as
// changes only; a retired category is not offered but still names documents;
// values never change; two categories cannot share a name; the list is read
// when used, never held as a constant.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  documentCategories, setDocumentCategories, cleanDocumentCategories, validateDocumentCategories,
  categoryLabel, shippedDocumentCategories, categoryValueFor,
} from './documentCategories.js';
import { categoryFromFilename } from './documentUtils.js';

afterEach(() => setDocumentCategories(null));

describe('document categories', () => {
  it('are the shipped list until an admin changes them', () => {
    expect(documentCategories().map((c) => c.value)).toEqual(shippedDocumentCategories().map((c) => c.value));
    expect(cleanDocumentCategories({ labels: { eicr: 'EICR' } })).toEqual({ labels: {}, added: [], retired: [] });
  });

  it('a rename changes the label and never the value', () => {
    setDocumentCategories({ labels: { eicr: 'Electrical condition report' } });
    expect(categoryLabel('eicr')).toBe('Electrical condition report');
    expect(documentCategories().find((c) => c.value === 'eicr')?.label).toBe('Electrical condition report');
  });

  it('an added category gets a stable value from its name', () => {
    setDocumentCategories({ added: [{ label: 'Lift examination (LOLER)' }] });
    expect(categoryValueFor('Lift examination (LOLER)')).toBe('lift_examination_loler');
    expect(categoryLabel('lift_examination_loler')).toBe('Lift examination (LOLER)');
  });

  it('a retired category is not offered, still names its documents, and stays on a document already in it', () => {
    setDocumentCategories({ retired: ['gas_safety'] });
    expect(documentCategories().some((c) => c.value === 'gas_safety')).toBe(false);
    expect(categoryLabel('gas_safety')).toBe('Gas Safety');
    expect(documentCategories({ keep: 'gas_safety' }).some((c) => c.value === 'gas_safety')).toBe(true);
    expect(categoryFromFilename('CP12 gas safe cert.pdf')).toBe('');
  });

  it('an unknown value shows as itself, never as a guess', () => {
    expect(categoryLabel('something_old')).toBe('something_old');
  });

  it('refuses two categories with one name, a shipped one added again, and a name with no letters', () => {
    expect(validateDocumentCategories({ labels: { eicr: 'Invoice' } })[0]).toMatch(/Two categories/);
    expect(validateDocumentCategories({ added: [{ label: 'EICR' }] }).join(' ')).toMatch(/already a category|Two categories/);
    expect(validateDocumentCategories({ added: [{ label: '!!!' }] })[0]).toMatch(/letter or number/);
  });

  it('no file holds the list as a constant', () => {
    const root = join(process.cwd(), 'src');
    /** @param {string} d @param {string[]} [o] */
    const walk = (d, o = []) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p, o);
        else if (/\.(js|svelte)$/.test(n) && !/\.test\.js$/.test(n)) o.push(p);
      }
      return o;
    };
    const bad = walk(root).filter((p) => {
      const src = readFileSync(p, 'utf8');
      return /^(export )?const \w+\s*=\s*documentCategories\(/m.test(src)
        || (/value: 'fire_risk_assessment'/.test(src) && !p.endsWith('documentCategories.js'));
    }).map((p) => relative(root, p));
    expect(bad).toEqual([]);
  });
});
