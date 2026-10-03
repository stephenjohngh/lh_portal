// src/lib/utils/aiModels.test.js
// One list of AI models. It was written three times (the Admin panel and both
// AI routes); a model added to one copy only would have been offered on screen
// and quietly replaced by the default in the route. §6ccc item 5.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AI_MODELS, DEFAULT_AI_MODEL, resolveAiModel } from './aiModels.js';

describe('resolveAiModel', () => {
  it('keeps a model on the list', () => {
    for (const m of AI_MODELS) expect(resolveAiModel(m.value)).toBe(m.value);
  });
  it('falls back to the default for anything else', () => {
    for (const v of [undefined, null, '', 'claude-unknown', 42]) expect(resolveAiModel(v)).toBe(DEFAULT_AI_MODEL);
  });
  it('the default is on the list', () => {
    expect(AI_MODELS.map((m) => m.value)).toContain(DEFAULT_AI_MODEL);
  });
});

describe('the model ids are written once', () => {
  it('no other source file names a Claude model', () => {
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
      .filter((rel) => rel !== 'lib/utils/aiModels.js')
      .filter((rel) => /['"`]claude-[a-z]+-\d/.test(readFileSync(join(root, rel), 'utf8')));
    expect(bad, 'use AI_MODELS / DEFAULT_AI_MODEL from $lib/utils/aiModels.js').toEqual([]);
  });
});
