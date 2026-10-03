// src/lib/utils/aiModels.test.js
// ⛔ No Claude model is named in code. An admin chooses from the models
// Anthropic offers now; a chosen model that has gone is replaced within its
// family; nothing chosen → the newest Haiku. User, 2026-10-03: "its supposed to
// be an app we can deploy. not one that needs to have code changes." §6ccc 5.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chooseModel, modelFamily, newestFirst } from './aiModels.js';

// What the Models API returns, in no particular order.
const OFFERED = [
  { id: 'claude-haiku-4-5-20251001', created_at: '2025-10-01T00:00:00Z' },
  { id: 'claude-sonnet-5-5',         created_at: '2026-09-28T00:00:00Z' },
  { id: 'claude-sonnet-5',           created_at: '2026-06-30T00:00:00Z' },
  { id: 'claude-opus-5-5',           created_at: '2026-09-22T00:00:00Z' },
];

describe('modelFamily', () => {
  it('reads the family from the id', () => {
    expect(modelFamily('claude-sonnet-4-5-20250929')).toBe('sonnet');
    expect(modelFamily('claude-haiku-4-5')).toBe('haiku');
    expect(modelFamily('something-else')).toBeNull();
  });
});

describe('chooseModel', () => {
  it('keeps the chosen model while Anthropic offers it', () => {
    expect(chooseModel('claude-opus-5-5', OFFERED)).toEqual({ model: 'claude-opus-5-5', substituted: false, reason: null });
  });

  it('replaces a retired choice with the newest of the SAME family, and says so', () => {
    const c = chooseModel('claude-sonnet-4-5-20250929', OFFERED);
    expect(c.model).toBe('claude-sonnet-5-5');
    expect(c.substituted).toBe(true);
    expect(c.reason).toMatch(/claude-sonnet-4-5-20250929 is no longer offered/);
  });

  it('with nothing chosen, uses the newest Haiku — not a substitution', () => {
    expect(chooseModel(null, OFFERED)).toEqual({ model: 'claude-haiku-4-5-20251001', substituted: false, reason: null });
  });

  it('a family that has gone entirely falls back to the newest Haiku', () => {
    expect(chooseModel('claude-instant-1-2', OFFERED).model).toBe('claude-haiku-4-5-20251001');
  });

  it('when the list cannot be read, uses the saved choice as it is', () => {
    expect(chooseModel('claude-opus-5-5', [])).toEqual({ model: 'claude-opus-5-5', substituted: false, reason: null });
    expect(chooseModel(null, []).model).toBeNull();
  });

  it('newest first, by release date', () => {
    expect(newestFirst(OFFERED).map((m) => m.id)[0]).toBe('claude-sonnet-5-5');
  });
});

describe('no model is named in code', () => {
  it('no source file names a Claude model', () => {
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
      .filter((rel) => /['"`]claude-[a-z]+-\d/.test(readFileSync(join(root, rel), 'utf8')));
    expect(bad, 'the admin chooses the model (Admin → Other Config → Portal); name none in code').toEqual([]);
  });
});
