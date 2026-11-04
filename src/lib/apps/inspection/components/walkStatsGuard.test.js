// Every place that shows a walk's figures must show NO ACCESS. The finish screen
// left it out, so a walk with a door not reached read "NO ACCESS 0" at the moment
// someone was deciding to close it (found running the fire door tutorial, 2026-11-04).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'src/lib/apps/inspection/components';
const uses = readdirSync(dir).filter((f) => f.endsWith('.svelte'))
  .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/<WalkStatsBars\b[\s\S]*?\/>/g)].map((m) => [f, m[0]]));

describe('WalkStatsBars', () => {
  it('is found, so this check is checking something', () => { expect(uses.length).toBeGreaterThan(1); });
  it.each(uses)('in %s is given the no-access count', (_f, tag) => { expect(tag).toContain('noAccessCount='); });
});
