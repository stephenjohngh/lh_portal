<!-- src/lib/apps/compliance/components/RegisterItemsList.svelte -->
<!--
  One of the register's non-requirement kinds, on screen: the outstanding
  actions, the reasoned absences, or the caveats about what the list does not
  claim.

  ⭐ WHY THIS EXISTS AT ALL. All three were PROSE in the obligations statement —
  §5, §7 and §8, wrapped round the register in a Word document. They were never
  prose in substance: they were lists written as paragraphs, and a list written
  as prose cannot be filtered, counted, assigned or handed to the person who
  must act on it. They are rows now, and rows deserve a screen. Until this
  component existed they were in the Word export and nowhere a person could see
  them.

  ⛔ IT SHARES NO PIPELINE WITH THE REQUIREMENTS LIST, deliberately — see the
  header of `registerItemView.js`. Coverage, scope, evidence route and the seven
  statuses are all requirement logic; asking any of them about an action would
  produce a confident, meaningless answer, which is the failure this project
  keeps finding. The two lists look alike and are computed apart.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import FilterBar from '#lib/components/common/FilterBar.svelte';
  import {
    filterItems, groupItems, itemTally, itemFilterFields, citableRef,
  } from '../utils/registerItemView.js';
  import { PRIORITY_MARKER, PRIORITY_LABEL } from '#lib/utils/registerKinds.js';
  import { fmtDateOnly } from '#lib/utils/dates.js';
  import { deadlineBand } from '#lib/workflow/workflowDeadlines.js';
  import { ACTION_STATUS_LABEL } from '../utils/complianceActionWorkflow.js';
  import ActionWorkPanel from './ActionWorkPanel.svelte';

  /** @type {'action'|'absence'|'caveat'} */
  export let kind = 'action';
  /** Every row the register holds — this component takes its own kind out. */
  export let items = [];
  /** Whether this kind is currently included in the Word file. */
  export let included = true;

  // ── The actions' workflow (W3, migrations 255–256) ──
  /** complianceActionsStore's state, or null where the kind is not 'action'. @type {any} */ export let wf = null;
  /** Each register row's id, by key (the workflow item names its row by id). @type {Record<string, string>} */
  export let idByKey = {};
  export let isAdmin = false;
  /** @type {string|null} */ export let me = null;
  /** @type {Record<string, string>} */ export let nameById = {};
  /** @type {any} */ export let onMove = null;
  /** @type {any} */ export let onAssign = null;
  /** @type {any} */ export let onSaveDetails = null;

  /** The workflow item of an action, or null. @param {any} item */
  const itemOf = (item) => (wf?.items ?? []).find((/** @type {any} */ i) => i.subject_id === idByKey[item.key]) ?? null;

  const dispatch = createEventDispatcher();

  let search = '';
  let filters = {};
  let expanded = new Set();

  // ⚠ Keyed on `kind`, which is a primitive. A `$:` that resets state must never
  // depend on an object prop: `safe_not_equal` is true for every object, so it
  // would re-run on each parent update and wipe what the user had typed.
  let shownFor = null;
  $: if (kind !== shownFor) {
    shownFor = kind;
    search = ''; filters = {}; expanded = new Set();
  }

  function toggle(key) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    expanded = next;
  }

  $: tally  = itemTally(items, kind);
  $: fields = itemFilterFields(kind, tally);
  $: shown  = filterItems(items, kind, {
    q: search,
    category: [...(filters.category ?? [])],
    priority: [...(filters.priority ?? [])],
    status:   [...(filters.status ?? [])],
  });

  // ⛔ Actions group by WHO MUST ACT and never by priority across categories —
  // the duty holder cannot do the fire engineer's work and neither can write
  // software, so the top of a globally sorted list would read as "do this next"
  // when it is nothing of the kind. The other kinds keep the author's order.
  $: groups = groupItems(kind, shown);

  // ⛔ NOTHING MAY BE LOST BETWEEN THE FILTER AND THE PAGE. `groupByCategory`
  // works by filtering on a known category, so an action whose category is
  // misspelt or new would simply not appear — and an empty group looks exactly
  // like a group that matched nothing. That is the shape of the worst fault this
  // register has produced: nine entries absent from every version of the
  // statement ever generated, including the copy an external reviewer assessed.
  // A test pins it; this says so where a reader would otherwise be misled.
  $: placed  = groups.reduce((n, g) => n + g.items.length, 0);
  $: dropped = shown.length - placed;
</script>

<div class="items">
  {#if fields.length}
    <FilterBar
      {fields}
      bind:values={filters}
      bind:query={search}
      searchPlaceholder="Name, consequence, reference…"
      resultLabel="{shown.length} of {tally.total}"
    />
  {/if}

  <!-- ⚠ The section toggle for the kind you are LOOKING AT, rather than only on
       the requirements tab. Somebody reading the actions is the person who wants
       to know whether they reach the document. It is the same state as the
       checkbox over there — one fact, two places to change it. -->
  <p class="include">
    <label>
      <input type="checkbox" checked={included}
        on:change={e => dispatch('include', /** @type {HTMLInputElement} */ (e.currentTarget).checked)} />
      Include these in the Word file
    </label>
    <span class="include-note">— the file itself is produced from the
      <strong>Compliance obligations</strong> tab.</span>
  </p>

  {#if dropped !== 0}
    <p class="dropped">
      ⚠ {dropped} of {shown.length} could not be shown below. This is a fault — please report it,
      and do not read this page as a complete list.
    </p>
  {/if}

  {#if shown.length === 0}
    <p class="none">Nothing matches these filters.</p>
  {/if}

  {#each groups as group (group.key)}
    {#if group.label}
      <div class="grp">
        <h4>{group.label}<span class="grp-n">{group.items.length}</span></h4>
        <p class="grp-blurb">{group.blurb}</p>
      </div>
    {/if}

    <div class="rows">
      {#each group.items as item (item.key)}
        {@const open = expanded.has(item.key)}
        {@const ref = citableRef(item)}
        <div class="row" class:expanded={open}>
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="row-head" on:click={() => toggle(item.key)}>
            <span class="chev" class:open>▸</span>
            <div class="row-main">
              <div class="row-title">
                {#if item.priority}
                  <span class="prio {item.priority}" title="{PRIORITY_LABEL[item.priority]} priority, compared with the others in this group">
                    {PRIORITY_MARKER[item.priority]}
                  </span>
                {/if}
                {#if ref}<span class="ref">{ref}</span>{/if}
                <span class="nm">{item.name}</span>
                {#if kind === 'action'}
                  {@const wi = itemOf(item)}
                  {@const band = item.actionStatus !== 'closed' ? deadlineBand(item.dueDate) : null}
                  <span class="status st-{item.actionStatus ?? 'open'}">{ACTION_STATUS_LABEL[item.actionStatus ?? 'open'] ?? item.actionStatus}</span>
                  {#if item.dueDate && item.actionStatus !== 'closed'}
                    <span class="due due-{band ?? 'none'}">Due {fmtDateOnly(item.dueDate)}</span>
                  {/if}
                  {#if wi?.assigned_to}<span class="with">With {nameById[wi.assigned_to] ?? 'someone'}</span>{/if}
                {/if}
              </div>
              {#if !open && item.description}
                <p class="one-line">{item.description}</p>
              {/if}
            </div>
          </div>

          {#if open}
            <div class="row-detail">
              {#if item.description}<p class="desc">{item.description}</p>{/if}
              {#if item.consequence}
                <p class="fact"><span class="fact-k">If it is not:</span> {item.consequence}</p>
              {/if}
              {#if item.unblocks}
                <p class="fact"><span class="fact-k">Unblocks:</span> {item.unblocks}</p>
              {/if}

              <!-- ⛔ PRINTED EVEN WHEN EMPTY, and that is the whole point. These
                   are facts about this building's arrangements; filling them
                   with plausible names would defeat the purpose. An unassigned
                   action is conspicuous every time it is read, where a paragraph
                   saying "several actions are unassigned" is not — round 6's
                   finding that the warning itself becomes permanent. -->
              {#if kind === 'action'}
                <p class="assign">
                  <span class="fact-k">Owner:</span>
                  {#if item.owner}{item.owner}{:else}<span class="unassigned">NOT ASSIGNED</span>{/if}
                  <span class="dot">·</span>
                  <span class="fact-k">Technical authority:</span>
                  {#if item.technicalAuthority}{item.technicalAuthority}{:else}<span class="unassigned">NOT ASSIGNED</span>{/if}
                  <span class="dot">·</span>
                  <span class="fact-k">Due:</span>
                  {#if item.dueDate}{fmtDateOnly(item.dueDate)}{:else}<span class="unassigned">NOT ASSIGNED</span>{/if}
                </p>
                {#if wf && onMove}
                  <ActionWorkPanel action={item} rowId={idByKey[item.key] ?? null} {wf} {isAdmin} {me} {nameById}
                    {onMove} {onAssign} {onSaveDetails} />
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .items { display: flex; flex-direction: column; gap: 0.7rem; }

  .include {
    display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
    font-size: 0.74rem; color: rgb(148 163 184);
  }
  .include label { display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; }
  .include-note { color: rgb(100 116 139); }

  .dropped {
    font-size: 0.78rem; line-height: 1.5; color: rgb(252 165 165);
    background: rgb(239 68 68 / 0.1); border: 1px solid rgb(239 68 68 / 0.35);
    border-radius: 8px; padding: 0.6rem 0.75rem;
  }
  .none { font-size: 0.8rem; color: rgb(100 116 139); }

  .grp { margin-top: 0.35rem; }
  .grp h4 { font-size: 0.82rem; font-weight: 600; color: rgb(226 232 240); }
  .grp-n {
    font-weight: 400; color: rgb(100 116 139); font-size: 0.78rem; margin-left: 0.4rem;
  }
  .grp-blurb { font-size: 0.74rem; color: rgb(100 116 139); line-height: 1.45; margin-top: 0.1rem; }

  .rows { display: flex; flex-direction: column; gap: 0.4rem; }
  .row {
    padding: 0.6rem 0.75rem; border-radius: 8px;
    background: rgb(15 23 42 / 0.45); border: 1px solid rgb(71 85 105 / 0.4);
  }
  .row.expanded { border-color: rgb(71 85 105 / 0.8); }
  .row-head { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; width: 100%; }
  .row-main { min-width: 0; flex: 1; }
  .row-title { display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }

  .chev { display: inline-block; transition: transform 0.15s; color: rgb(148 163 184); font-size: 0.8rem; }
  .chev.open { transform: rotate(90deg); }

  .prio { font-size: 0.72rem; }
  .ref {
    font-size: 0.62rem; letter-spacing: 0.05em; padding: 0.1rem 0.35rem; border-radius: 4px;
    background: rgb(71 85 105 / 0.5); color: rgb(203 213 225); white-space: nowrap;
  }
  .nm { font-weight: 600; color: rgb(226 232 240); font-size: 0.85rem; }

  .one-line {
    font-size: 0.76rem; color: rgb(148 163 184); margin-top: 0.15rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .row-detail {
    margin-top: 0.5rem; padding-top: 0.5rem; padding-left: 1.3rem;
    border-top: 1px solid rgb(71 85 105 / 0.4);
  }
  .desc { font-size: 0.8rem; color: rgb(203 213 225); line-height: 1.5; }
  .fact { font-size: 0.76rem; color: rgb(148 163 184); line-height: 1.5; margin-top: 0.35rem; }
  .fact-k { color: rgb(100 116 139); font-weight: 600; }
  .assign {
    font-size: 0.74rem; color: rgb(148 163 184); margin-top: 0.5rem;
    display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap;
  }
  .unassigned { font-weight: 700; color: rgb(252 165 165); letter-spacing: 0.03em; }
  .dot { color: rgb(71 85 105); }

  .status, .due, .with {
    font-size: 0.62rem; padding: 0.1rem 0.4rem; border-radius: 999px; white-space: nowrap;
    border: 1px solid rgb(71 85 105 / 0.6); color: rgb(203 213 225);
  }
  .st-in_progress { border-color: rgb(56 189 248 / 0.6); color: rgb(125 211 252); }
  .st-answered    { border-color: rgb(167 139 250 / 0.6); color: rgb(196 181 253); }
  .st-closed      { border-color: rgb(34 197 94 / 0.5); color: rgb(134 239 172); }
  .due-overdue { border-color: rgb(239 68 68 / 0.6); color: rgb(252 165 165); }
  .due-due_soon { border-color: rgb(245 158 11 / 0.6); color: rgb(252 211 77); }
  .with { color: rgb(148 163 184); }
</style>
