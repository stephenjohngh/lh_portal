<!-- src/lib/apps/admin/components/RegisterImportDiff.svelte -->
<!--
  What a re-import of the shipped standard register would do. R3.

  ⛔ THE RULE THIS SCREEN EXISTS TO ENFORCE: a row edited here is never swept up
  by a bulk action. R1's import only ADDED, which is safe and insufficient — a
  corrected citation shipped in a later release would be silently declined.
  Overwriting would be worse: it would discard a correction somebody made here,
  in a register where about half the citation errors found in September were
  ours. So it reports, and a person decides — and the divergent rows are offered
  one at a time, on purpose.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import { fmtDate } from '$lib/utils/dates.js';
  import { describeDiff } from '$lib/utils/registerDiff.js';

  /** @type {ReturnType<typeof import('$lib/utils/registerDiff.js').diffRegister>} */
  export let diff;
  export let busy = false;

  const dispatch = createEventDispatcher();

  let expanded = new Set();
  const toggle = (key) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    expanded = next;
  };

  const short = (v) => {
    if (v === null || v === undefined) return '—';
    const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return t.length > 180 ? t.slice(0, 180) + '…' : t;
  };
</script>

<div class="diff">
  <p class="diff-head">{describeDiff(diff)}</p>

  {#if !diff.hasAnything}
    <p class="diff-none">
      Every requirement here matches the standard register, and nothing it carries is missing.
      {#if diff.localOnly.length}
        {diff.localOnly.length} requirement{diff.localOnly.length === 1 ? ' was' : 's were'} added
        in this building — the import leaves those alone.
      {/if}
    </p>
  {/if}

  <!-- ── New in the standard register ─────────────────────────────────── -->
  {#if diff.added.length}
    <div class="grp">
      <div class="grp-head">
        <h5>New in the standard register ({diff.added.length})</h5>
        <ProtectedButton requireAdmin={true} variant="primary" size="small" disabled={busy}
          on:click={() => dispatch('apply', { add: diff.added.map(e => e.key) })}>
          Add all {diff.added.length} to the list
        </ProtectedButton>
      </div>
      {#each diff.added as e (e.key)}
        <div class="row"><span class="nm">{e.name}</span><span class="ref">{e.statutoryRef}</span></div>
      {/each}
    </div>
  {/if}

  <!-- ── Changed upstream, untouched here ─────────────────────────────── -->
  {#if diff.updatable.length}
    <div class="grp">
      <div class="grp-head">
        <h5>Updated in the standard register ({diff.updatable.length})</h5>
        <ProtectedButton requireAdmin={true} variant="primary" size="small" disabled={busy}
          on:click={() => dispatch('apply', { update: diff.updatable.map(r => r.key) })}>
          Use the new wording on all {diff.updatable.length}
        </ProtectedButton>
      </div>
      <p class="grp-note">
        Nobody has changed these here, so the difference is a correction that came with a
        later release. Taking them is the reason to look.
      </p>
      {#each diff.updatable as r (r.key)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="row clickable" on:click={() => toggle(r.key)}>
          <span class="chev" class:open={expanded.has(r.key)}>▸</span>
          <span class="nm">{r.name}</span>
          <span class="flds">{r.changes.map(c => c.field).join(', ')}</span>
        </div>
        {#if expanded.has(r.key)}
          <div class="changes">
            {#each r.changes as c (c.field)}
              <p class="fld">{c.field}</p>
              <p class="was"><span class="lbl">ours</span> {short(c.here)}</p>
              <p class="now"><span class="lbl">standard</span> {short(c.seed)}</p>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- ── Divergent: edited here AND different ─────────────────────────── -->
  {#if diff.divergent.length}
    <div class="grp grp-warn">
      <div class="grp-head"><h5>⛔ Edited here, and different ({diff.divergent.length})</h5></div>
      <p class="grp-note">
        These were changed here, and the standard version now says something different.
        <strong>There is no “take all” for these</strong>: taking the standard version throws away
        what somebody here decided, and keeping yours turns down a correction that may be right.
        Read each one and choose.
      </p>
      {#each diff.divergent as r (r.key)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="row clickable" on:click={() => toggle(r.key)}>
          <span class="chev" class:open={expanded.has(r.key)}>▸</span>
          <span class="nm">{r.name}</span>
          <span class="flds">{r.changes.map(c => c.field).join(', ')}</span>
          <span class="when">edited {fmtDate(r.seedModifiedAt)}</span>
        </div>
        {#if expanded.has(r.key)}
          <div class="changes">
            {#each r.changes as c (c.field)}
              <p class="fld">{c.field}</p>
              <p class="was"><span class="lbl">here</span> {short(c.here)}</p>
              <p class="now"><span class="lbl">standard</span> {short(c.seed)}</p>
            {/each}
            <div class="row-actions">
              <ProtectedButton requireAdmin={true} variant="secondary" size="small" disabled={busy}
                on:click={() => dispatch('apply', { update: [r.key] })}>
                Use the standard wording
              </ProtectedButton>
              <Button variant="secondary" size="small" disabled={busy}
                on:click={() => dispatch('edit', r.key)}>Keep ours — open it to edit</Button>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- ── Dropped upstream ─────────────────────────────────────────────── -->
  {#if diff.withdrawn.length}
    <div class="grp">
      <div class="grp-head"><h5>No longer in the standard register ({diff.withdrawn.length})</h5></div>
      <p class="grp-note">
        Shown for information only — nothing here is removed for you. Work and decisions may
        still point at these, so if one really has gone, retire it on its own row. That keeps the
        evidence attached to something that can still explain it.
      </p>
      {#each diff.withdrawn as r (r.key)}
        <div class="row"><span class="nm">{r.name}</span><span class="ref">{r.key}</span></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff { display: flex; flex-direction: column; gap: 0.7rem; font-size: 0.8rem; }
  .diff-head { font-weight: 600; color: rgb(226 232 240); }
  .diff-none { color: rgb(148 163 184); line-height: 1.5; }
  .grp { border: 1px solid rgb(71 85 105 / 0.6); border-radius: 6px; padding: 0.6rem 0.7rem;
         display: flex; flex-direction: column; gap: 0.35rem; }
  .grp-warn { border-color: rgb(248 113 113 / 0.45); background: rgb(248 113 113 / 0.06); }
  .grp-head { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; }
  .grp-head h5 { font-size: 0.82rem; font-weight: 700; color: rgb(226 232 240); }
  .grp-note { font-size: 0.75rem; color: rgb(148 163 184); line-height: 1.5; }
  .row { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.2rem 0; }
  .clickable { cursor: pointer; }
  .nm { color: rgb(226 232 240); }
  .ref, .flds, .when { font-size: 0.73rem; color: rgb(100 116 139); }
  .flds { margin-left: auto; }
  .when { color: rgb(252 211 77); }
  .chev { color: rgb(148 163 184); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .changes { padding: 0.4rem 0 0.5rem 1.2rem; display: flex; flex-direction: column; gap: 0.15rem;
             border-left: 2px solid rgb(71 85 105 / 0.5); margin-left: 0.3rem; }
  .fld { font-weight: 600; color: rgb(203 213 225); margin-top: 0.3rem; }
  .was, .now { font-size: 0.75rem; line-height: 1.45; color: rgb(148 163 184); }
  .lbl { display: inline-block; min-width: 4.4rem; color: rgb(100 116 139); font-size: 0.7rem;
         text-transform: uppercase; letter-spacing: 0.04em; }
  .now { color: rgb(134 239 172); }
  .row-actions { display: flex; gap: 0.4rem; margin-top: 0.5rem; }
</style>
