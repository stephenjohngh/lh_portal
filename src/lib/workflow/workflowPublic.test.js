// The public status page (migration 261): which processes may answer the
// public, what words a step shows, and the line it leaves in the history.
import { describe, it, expect } from 'vitest';
import { PUBLIC_STATUS_APPS, PUBLIC_KIND_WORD, publicStageName, workflowDiff, STEP_KINDS } from './workflowModel.js';
import { DEFAULT_APPLICATION_WORKFLOW } from '#lib/apps/parking/utils/applicationWorkflow.js';

describe('the public status page', () => {
  it('only processes whose items are named by a reference someone outside holds', () => {
    expect([...PUBLIC_STATUS_APPS].sort()).toEqual(['cases', 'complaints', 'parking']);
  });

  it('shows a step\u2019s public name, or only a word for its kind \u2014 never the staff name', () => {
    expect(publicStageName({ public_name: 'Being checked', kind: 'open' })).toBe('Being checked');
    expect(publicStageName({ public_name: '  ', kind: 'open' })).toBe('Being dealt with');
    expect(publicStageName({ name: 'Awaiting legal advice', kind: 'open' })).toBe('Being dealt with');
    for (const k of STEP_KINDS.map((x) => x.value)) expect(PUBLIC_KIND_WORD[k], k).toBeTruthy();
  });

  it('the parking application ships a public name on every step, so its page reads as it did', () => {
    for (const s of DEFAULT_APPLICATION_WORKFLOW.steps) expect(String(s.public_name ?? '').trim(), s.key).not.toBe('');
  });

  it('switching it on or off is said in the history, in words', () => {
    const def = { name: 'X', steps: [], moves: [] };
    expect(workflowDiff({ ...def, public_status: false }, { ...def, public_status: true })[0]).toMatch(/Public status page switched on/);
    expect(workflowDiff({ ...def, public_status: true }, { ...def, public_status: false })[0]).toMatch(/switched off/);
    expect(workflowDiff(def, def).join(' ')).not.toMatch(/Public status/);
  });
});
