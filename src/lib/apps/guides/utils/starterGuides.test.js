import { describe, it, expect } from 'vitest';
import { STARTER_GUIDES } from './starterGuides.js';
import { stepProblems, publishProblems } from './guideModel.js';

describe('the starter guides', () => {
  it('are valid guides: every step within the limits, a stop step says what to do', () => {
    for (const g of STARTER_GUIDES) {
      const steps = g.steps.map((s) => ({ kind: s.kind ?? 'step', title: s.title, body: s.body ?? null }));
      for (const s of steps) expect(stepProblems(s), `${g.key}: ${s.title}`).toEqual([]);
      expect(publishProblems({ title: g.title, status: 'draft', minutes: g.minutes }, steps), g.key).toEqual([]);
    }
  });
  it('have unique keys and titles, and every one ends with a stop step', () => {
    expect(new Set(STARTER_GUIDES.map((g) => g.key)).size).toBe(STARTER_GUIDES.length);
    expect(new Set(STARTER_GUIDES.map((g) => g.title)).size).toBe(STARTER_GUIDES.length);
    for (const g of STARTER_GUIDES) expect(g.steps.at(-1)?.kind, g.key).toBe('stop');
  });
  it('carry no codes, keys or passwords (a guide is readable by everyone signed in)', () => {
    const text = JSON.stringify(STARTER_GUIDES).toLowerCase();
    expect(text).not.toMatch(/password|passcode|pin code|\b\d{4,}\b/);
  });
  it('use only the default categories and audiences the app offers', async () => {
    const { DEFAULT_CATEGORIES } = await import('./guideDefaults.js');
    const { AUDIENCES } = await import('./guideModel.js');
    for (const g of STARTER_GUIDES) {
      expect(DEFAULT_CATEGORIES.map((c) => c.key)).toContain(g.category_key);
      expect(AUDIENCES).toContain(g.audience);
    }
  });
});
