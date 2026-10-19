// The browser's copy of the save rules (workflowProblem) against the shared
// list of workflows that must be refused — the same list workflowDb.test.js
// sends to workflow_save() in the database, so the two copies are held to one
// set of answers (2026-10-18 review).
import { describe, it, expect } from 'vitest';
import { workflowProblem } from './workflowModel.js';
import { SAVE_CASES } from './workflowSaveCases.test-helper.js';

describe('workflowProblem — the shared save cases', () => {
  it('has cases to run', () => expect(SAVE_CASES.length).toBeGreaterThan(15));
  for (const c of SAVE_CASES) {
    it(c.name, () => {
      const problem = workflowProblem({ steps: c.steps, moves: c.moves, appId: c.appId, key: c.key, fields: c.fields ?? [] });
      if (c.expect) expect(problem).toMatch(c.expect);
      else expect(problem).toBeNull();
    });
  }
});
