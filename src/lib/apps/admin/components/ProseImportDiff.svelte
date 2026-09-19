<!-- src/lib/apps/admin/components/ProseImportDiff.svelte -->
<!--
  What a re-import of the shipped written sections would do.

  Completes for the statement's PROSE what R3 did for the register, and it is
  the same rule: R5's import only ADDED, so a corrected §3 or §4 shipped in a
  later release was silently declined — the only sign being that the shipped
  text and the stored text quietly disagreed. Overwriting would be worse: it
  discards wording somebody settled here, in a document that has been through
  fourteen rounds of external review. So it reports, and a person decides.

  ⛔ A SECTION EDITED HERE IS NEVER SWEPT UP BY A BULK ACTION. Those are offered
  one at a time, on purpose — each is a judgement between two considered
  wordings, and there is no general answer.

  ⚠ IT SHOWS COUNTS OF LINES, NOT THE TEXT. A section runs to a hundred lines or
  more; printing two of them side by side would be unreadable and nobody would
  read it. "12 lines added, 3 removed" is what decides whether to look, and
  **Open the section** is how you look.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import { fmtDate } from '$lib/utils/dates.js';
  import { describeProseDiff, titleOf } from '$lib/utils/proseDiff.js';

  /** @type {ReturnType<typeof import('$lib/utils/proseDiff.js').diffProse>} */
  export let diff;
  export let busy = false;

  const dispatch = createEventDispatcher();

  /** "12 added, 3 removed" — or the structural change, where that is what moved. */
  function summarise(row) {
    const bits = [];
    if (row.changes.some(c => c.field === 'markdown')) {
      const { added, removed } = row.delta;
      bits.push(`${added} line${added === 1 ? '' : 's'} added, ${removed} removed`);
    }
    // ⚠ A position change reorders the document while every word stays
    // identical, so it has to be named rather than left to a line count.
    const pos = row.changes.find(c => c.field === 'position');
    if (pos) bits.push(`moves from position ${pos.here} to ${pos.seed}`);
    const gen = row.changes.find(c => c.field === 'generated');
    if (gen) bits.push(gen.seed ? 'becomes the register’s slot' : 'stops being the register’s slot');
    return bits.join(' · ');
  }
</script>

<div class="diff">
  <p class="diff-head">{describeProseDiff(diff)}</p>

  {#if !diff.hasAnything}
    <p class="diff-none">
      Every written section here matches the text that ships, and nothing it
      carries is missing.
    </p>
  {/if}

  <!-- ── New in the shipped text ───────────────────────────────────────── -->
  {#if diff.added.length}
    <div class="grp">
      <div class="grp-head">
        <h5>New in the shipped text ({diff.added.length})</h5>
        <ProtectedButton requireAdmin={true} variant="primary" size="small" disabled={busy}
          on:click={() => dispatch('apply', { add: diff.added.map(s => s.key) })}>
          Add all {diff.added.length}
        </ProtectedButton>
      </div>
      <ul>
        {#each diff.added as s (s.key)}
          <li><span class="nm">{titleOf(s)}</span> <span class="k">{s.key}</span></li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- ── Changed in the shipped text, untouched here ───────────────────── -->
  {#if diff.updatable.length}
    <div class="grp">
      <div class="grp-head">
        <h5>Updated in the shipped text ({diff.updatable.length})</h5>
        <ProtectedButton requireAdmin={true} variant="primary" size="small" disabled={busy}
          on:click={() => dispatch('apply', { update: diff.updatable.map(r => r.key) })}>
          Take all {diff.updatable.length}
        </ProtectedButton>
      </div>
      <!-- ⚠ Safe as a bulk action ONLY because nobody has edited these here, so
           the difference IS the shipped text moving — which is the reason to
           import at all. -->
      <p class="note">
        Nobody has edited these in this building, so the difference is the shipped
        text having moved. Taking them is the reason to import.
      </p>
      <ul>
        {#each diff.updatable as r (r.key)}
          <li>
            <span class="nm">{r.title}</span>
            <span class="delta">{summarise(r)}</span>
            <Button variant="secondary" size="small" disabled={busy}
              on:click={() => dispatch('open', r.key)}>Open the section</Button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- ── Differ AND were edited here ───────────────────────────────────── -->
  {#if diff.divergent.length}
    <div class="grp divergent">
      <h5>Differ, and were edited here ({diff.divergent.length})</h5>
      <!-- ⛔ NO BULK ACTION, deliberately. Taking the shipped version discards
           what somebody wrote here; keeping this one declines a correction that
           may be right. There is no answer that is right for all of them. -->
      <p class="note">
        ⛔ <strong>Each of these is a judgement, so there is no button for all of
        them.</strong> Taking the shipped version discards the wording somebody
        settled here; keeping this one declines a correction that may be right.
        Open the section, read both, then decide.
      </p>
      <ul>
        {#each diff.divergent as r (r.key)}
          <li>
            <span class="nm">{r.title}</span>
            <span class="delta">{summarise(r)}</span>
            {#if r.seedModifiedAt}
              <span class="when">edited here {fmtDate(r.seedModifiedAt)}</span>
            {/if}
            <span class="acts">
              <Button variant="secondary" size="small" disabled={busy}
                on:click={() => dispatch('open', r.key)}>Open the section</Button>
              <ProtectedButton requireAdmin={true} variant="secondary" size="small" disabled={busy}
                on:click={() => dispatch('apply', { update: [r.key] })}>
                Take the shipped version
              </ProtectedButton>
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- ── No longer shipped ─────────────────────────────────────────────── -->
  {#if diff.withdrawn.length}
    <div class="grp">
      <h5>No longer in the shipped text ({diff.withdrawn.length})</h5>
      <!-- ⚠ Surfaced, never acted on. Removing a section of the statement is a
           decision about a reviewed document, not a side effect of import. -->
      <p class="note">
        These are held here and are not in the text that ships. Nothing is done
        about them: removing a section of the statement is a decision about a
        reviewed document, not a side effect of pressing import.
      </p>
      <ul>
        {#each diff.withdrawn as r (r.key)}
          <li><span class="nm">{r.title}</span> <span class="k">{r.key}</span></li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if diff.localOnly.length}
    <p class="local">
      {diff.localOnly.length} section{diff.localOnly.length === 1 ? '' : 's'} added in
      this building; the import leaves {diff.localOnly.length === 1 ? 'it' : 'them'} alone.
    </p>
  {/if}
</div>

<style>
  .diff { display: flex; flex-direction: column; gap: 0.7rem; font-size: 0.8rem; }
  .diff-head { margin: 0; font-weight: 600; color: rgb(226 232 240); }
  .diff-none { margin: 0; color: rgb(148 163 184); }

  .grp { border: 1px solid rgb(51 65 85); border-radius: 0.4rem; padding: 0.6rem 0.7rem; }
  .grp.divergent { border-color: rgb(120 53 15); background: rgb(41 20 6); }
  .grp-head { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  h5 { margin: 0 0 0.35rem; font-size: 0.82rem; color: rgb(226 232 240); }
  .note { margin: 0.2rem 0 0.45rem; font-size: 0.74rem; color: rgb(148 163 184); }
  .grp.divergent .note { color: rgb(253 230 138); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  li { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .nm { color: rgb(226 232 240); font-weight: 600; }
  .k, .when { font-size: 0.72rem; color: rgb(100 116 139); }
  .delta { font-size: 0.74rem; color: rgb(148 163 184); }
  .acts { display: flex; gap: 0.4rem; margin-left: auto; }
  .local { margin: 0; font-size: 0.74rem; color: rgb(148 163 184); }
</style>
