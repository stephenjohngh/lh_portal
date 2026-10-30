// A ratchet on hand-written <button> elements in the standard apps.
//
// The rule (user, 2026-10-30): everything is styled through the common controls
// (Button, MenuButton, SegmentedControl, FormInput …), so a change of look is one
// edit. ~300 raw buttons were converted; the rest are chips and toggles with a
// computed class, listed in rawButtonBaseline.json with how many each file still
// has. A file may only go DOWN. Only the phone apps and the common components'
// own internals are out of scope (they own their look); public pages use
// Button variant="public" / PublicShell.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import baseline from './rawButtonBaseline.json';

const SKIP_DIRS = ['apps/inspection/', 'apps/mobileplan/', 'apps/managementmobile/'];
const SKIP_FILES = ['TextScanner', 'RichTextEditor', 'EditorFindBar', 'PhotoLightbox', 'ConfirmDialog', 'Modal.svelte',
  'MenuButton', 'SegmentedControl', 'TabBar', 'AppGate', 'common/Button', 'MultiSelectDropdown',
  'DocEditor', 'ScanButton', 'harness', '.test.'];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

describe('raw <button>s in the standard apps', () => {
  it('no file has more than its baseline, and a file not listed has none', () => {
    const over = [];
    for (const p of walk('src')) {
      const pp = p.replace(/\\/g, '/');
      if (SKIP_DIRS.some(d => pp.includes(d)) || SKIP_FILES.some(f => pp.includes(f))) continue;
      const n = (fs.readFileSync(p, 'utf8').match(/<button\b/g) || []).length;
      if (n > (baseline[pp] || 0)) over.push(`${pp}: ${n} (allowed ${baseline[pp] || 0})`);
    }
    expect(over, 'use <Button>, <SegmentedControl> or <MenuButton> from common/ instead').toEqual([]);
  });
});
