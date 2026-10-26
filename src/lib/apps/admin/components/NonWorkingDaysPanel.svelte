<!-- src/lib/apps/admin/components/NonWorkingDaysPanel.svelte -->
<!-- Admin → Other Config → Non-working days: the bank holidays and any day the
     office is closed. ONE list for the whole portal (table non_working_days,
     migration 248): a working-day deadline in any workflow skips these, and the
     Planner shades each one and names it. It lived inside Admin → Workflows
     until 2026-10-26, which made it look like a workflow setting.

     The shipped England and Wales bank holidays to 2028 are added when the list
     is empty (the seed rule, nonWorkingDays.js) and after that it is the
     admin's: add the next years, or a closure, or remove a day. Changing it
     re-dates every open item with a working-day deadline (a database trigger). -->
<script>
  import { onMount } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { listNonWorkingDays, ensureNonWorkingDays, addNonWorkingDay, removeNonWorkingDay } from '#lib/workflow/nonWorkingDays.js';
  import { fmtDate, weekdayName } from '#lib/utils/dates.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {{ day: string, name: string }[]} */
  let days = [];
  let ready = false;
  let newDay = '';
  let newName = '';
  let error = '';
  let note = '';

  const inputCls = 'px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200';

  async function read() {
    try { days = await listNonWorkingDays(); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the non-working days.'); }
  }
  async function add() {
    error = ''; note = '';
    const day = newDay;
    const name = newName.trim();
    if (!day || !name) { error = 'Give the date and what it is.'; return; }
    try {
      await addNonWorkingDay(day, name);
      logAudit('create', 'non_working_day', day, name, { appId: 'admin', eventCategory: 'admin' });
      note = 'Added. Open items with a working-day deadline have been re-dated.';
      newDay = ''; newName = '';
      await read();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'That day could not be added.'); }
  }
  async function remove(/** @type {{ day: string, name: string }} */ d) {
    error = ''; note = '';
    const { day, name } = d;
    try {
      await removeNonWorkingDay(day);
      logAudit('delete', 'non_working_day', day, name, { appId: 'admin', eventCategory: 'admin' });
      note = 'Removed. Open items with a working-day deadline have been re-dated.';
      await read();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'That day could not be removed.'); }
  }

  onMount(async () => {
    try {
      await ensureNonWorkingDays().catch((/** @type {any} */ err) => { error = errMessage(err, 'The bank holidays could not be added.'); });
      await read();
    } finally { ready = true; }
  });

  $: byYear = days.reduce((/** @type {Record<string, typeof days>} */ acc, d) => { (acc[d.day.slice(0, 4)] ??= []).push(d); return acc; }, {});
</script>

<div class="space-y-3" data-testid="non-working-days">
  <div>
    <h2 class="text-lg font-semibold text-white">Non-working days</h2>
    <p class="text-xs text-slate-400 mt-1">
      Bank holidays and any day the office is closed. Weekends are always non-working and are not listed.
      A deadline counted in <strong>working days</strong> in any workflow skips these, and the <strong>Planner</strong>
      shades each one grey and names it. The bank holidays for England and Wales to 2028 come with the portal;
      add the next years, or a closure. Changing the list re-dates the open items that have a working-day deadline.
    </p>
  </div>

  <ErrorDisplay message={error} onDismiss={() => (error = '')} />
  {#if note}<p class="text-xs text-green-400" role="status">{note}</p>{/if}

  <div class="flex flex-wrap items-end gap-2">
    <input type="date" class={inputCls} bind:value={newDay} aria-label="Date" />
    <input class="{inputCls} w-56" bind:value={newName} placeholder="e.g. Christmas Day" aria-label="What it is"
           on:keydown={(e) => { if (e.key === 'Enter') add(); }} />
    <Button variant="secondary" size="small" on:click={add}>+ Add a day</Button>
  </div>

  {#if !ready}
    <LoadingSpinner text="Reading the non-working days…" />
  {:else if days.length === 0}
    <p class="text-xs text-slate-500">None — working days skip only weekends.</p>
  {:else}
    {#each Object.entries(byYear) as [year, list] (year)}
      <div>
        <p class="text-sm font-semibold text-slate-200 mb-1">{year}</p>
        <ul class="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
          {#each list as d (d.day)}
            <li class="flex items-center justify-between gap-2 border-b border-slate-800 py-0.5">
              <span><span class="text-slate-300">{weekdayName(d.day)} {fmtDate(d.day)}</span> <span class="text-slate-500">· {d.name}</span></span>
              <Button variant="tertiary" size="xs" on:click={() => remove(d)}>Remove</Button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}
</div>
