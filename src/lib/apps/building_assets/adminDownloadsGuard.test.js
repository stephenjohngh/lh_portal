// Building Assets' bulk downloads are for admins only (user, 2026-10-10: "at
// the moment I didn't want a way to have all data downloaded"). The data is in
// the browser anyway, so hiding the buttons is a deterrent, not a lock — the
// level wanted for known users. This guard stops a later edit from bringing a
// download control back outside the admin-only block, which nothing else
// would notice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Each file, and the markup that starts a bulk download in it. */
const DOWNLOADS = {
  'src/lib/apps/building_assets/components/ComponentsTab.svelte': ['<ReportActionButtons'],
  'src/lib/apps/building_assets/components/SpacesTab.svelte': ['on:click={exportCsv}'],
};

/**
 * The open block conditions at each line of a Svelte template: a stack of
 * `{#if …}` conditions, with an `{:else}` branch marked as such.
 * @param {string} src
 */
function blockStack(src) {
  const template = src.slice(src.lastIndexOf('</script>') + 1);
  const offset = src.length - template.length;
  const stack = [];
  const at = [];               // [index, stack snapshot] for every tag
  const re = /\{(#if|#each|#await|#key|:else if|:else|\/if|\/each|\/await|\/key)([^}]*)\}/g;
  let m;
  while ((m = re.exec(template))) {
    const [, tag, rest] = m;
    if (tag.startsWith('#')) stack.push({ kind: tag.slice(1), cond: rest.trim(), branch: 'then' });
    else if (tag.startsWith(':')) { if (stack.length) stack[stack.length - 1].branch = 'else'; }
    else stack.pop();
    at.push([offset + m.index, stack.map((s) => ({ ...s }))]);
  }
  return (index) => {
    let snap = [];
    for (const [i, st] of at) { if (i > index) break; snap = st; }
    return snap;
  };
}

const adminOnly = (stack) => stack.some((s) => s.kind === 'if' && s.branch === 'then'
  && /^\$permissions\.isAdmin\b/.test(s.cond));

describe('Building Assets: bulk downloads are shown to admins only', () => {
  for (const [file, triggers] of Object.entries(DOWNLOADS)) {
    const src = readFileSync(file, 'utf8');
    const stackAt = blockStack(src);
    for (const trigger of triggers) {
      it(`${file.split('/').pop()}: ${trigger}`, () => {
        const i = src.indexOf(trigger);
        expect(i, `${trigger} not found — if it moved, update this guard`).toBeGreaterThan(-1);
        expect(adminOnly(stackAt(i)), `${trigger} is not inside {#if $permissions.isAdmin}`).toBe(true);
      });
    }
  }

  it('the block reader sees an else branch as not admin', () => {
    const src = '<script></script>{#if $permissions.isAdmin}<a/>{:else}<b/>{/if}';
    const at = blockStack(src);
    expect(adminOnly(at(src.indexOf('<a/>')))).toBe(true);
    expect(adminOnly(at(src.indexOf('<b/>')))).toBe(false);
  });
});
