<!-- src/lib/apps/parking/components/PermitsTab.svelte -->
<!-- Parking permits for the side road, for a day or a week (migration 236).
     Issue: company, registration, valid from/to, issued by — the database
     gives the next number, the record is kept, and the finished A4 permit
     downloads as a PDF built in the browser from the admin's template.
     Anyone with an editable Parking grant issues; an admin deletes a permit
     issued in error and sets the template (PermitTemplatePanel). -->
<script>
  import { onMount } from 'svelte';
  import { permitStore } from '../stores/permitStore.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { portalSettings } from '#lib/stores/portalSettings.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { auth } from '#lib/stores/auth.js';
  import { buildingName } from '#lib/utils/identity.js';
  import { today, fmtDateOnly } from '#lib/utils/dates.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { downloadBlob } from '#lib/utils/download.js';
  import { errMessage } from '#lib/utils/errors.js';
  import {
    PERMIT_DURATIONS, validToFor, validatePermit, permitNumberLabel, permitStatus, permitDays,
    reissueFields, recentValues,
  } from '../utils/permitModel.js';
  import PermitTemplatePanel from './PermitTemplatePanel.svelte';
  import Button        from '#lib/components/common/Button.svelte';
  import FormInput     from '#lib/components/common/FormInput.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay  from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';

  export let canEdit = false;

  const STATUS = {
    current:  { label: 'In force', cls: 'bg-green-700/40 text-green-300' },
    upcoming: { label: 'Not yet',  cls: 'bg-sky-700/40 text-sky-300' },
    expired:  { label: 'Expired',  cls: 'bg-slate-700 text-slate-400' },
  };

  let ready = false;
  let loadError = '';
  onMount(async () => {
    try { await Promise.all([permitStore.load(), profilesStore.load()]); }
    catch (/** @type {any} */ err) { loadError = errMessage(err, 'Could not read the parking permits.'); }
    finally { ready = true; }
  });

  // ── Issue ─────────────────────────────────────────────────────────────
  let duration = 'day';
  let form = blankForm();
  let issuing = false;
  let issueError = '';
  let issuedNote = '';

  function blankForm() {
    const from = today();
    return { company: '', registration: '', valid_from: from, valid_to: validToFor(from, 'day') ?? '', issued_by: '' };
  }
  // The issuer defaults to the person signed in, and can be changed.
  /** @param {any[]} list @param {string|undefined} id */
  const nameOf = (list, id) => list.find((p) => p.id === id)?.full_name ?? '';
  $: me = nameOf($profiles.list, $auth.user?.id);
  $: if (me && !form.issued_by) form.issued_by = me;

  function chooseDuration(key) {
    duration = key;
    form.valid_to = validToFor(form.valid_from, key) ?? '';
  }
  function fromChanged() {
    if (duration !== 'custom') form.valid_to = validToFor(form.valid_from, duration) ?? '';
  }
  function toChanged() { duration = 'custom'; }

  // The same contractor and vehicle come back: a row's ↻ fills the form with
  // its company and registration, dates from today for one day, and leaves
  // the issuer as whoever is issuing now.
  let issueSection;
  function reissue(p) {
    form = { ...form, ...reissueFields(p, today()) };
    duration = 'day';
    issueError = '';
    issuedNote = `Filled in from permit ${permitNumberLabel(p.permit_number)} — check the dates, then issue.`;
    issueSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Suggestions while typing, from the permits already issued (newest first).
  $: companies = recentValues($permitStore.permits, 'company');
  $: registrations = recentValues($permitStore.permits, 'registration');

  $: building = { name: buildingName($portalSettings.building), address: $portalSettings.building?.address ?? '' };

  async function download(permit) {
    // Loaded only when a permit is asked for: the canvas and PDF code are not needed before.
    const { renderPermitPdf } = await import('../utils/permitRender.js');
    const { bytes, filename } = await renderPermitPdf(permit, $permitStore.template ?? {}, building, $permitStore.imageUrls);
    downloadBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/pdf' }), filename);
  }

  async function issue() {
    issueError = ''; issuedNote = '';
    const problem = validatePermit(form);
    if (problem) { issueError = problem; return; }
    issuing = true;
    let saved = null;
    try {
      saved = await permitStore.issue(form);
      await download(saved);
      issuedNote = `Permit ${permitNumberLabel(saved.permit_number)} issued and downloaded.`;
      const keep = form.issued_by;
      form = { ...blankForm(), issued_by: keep };
      duration = 'day';
    } catch (/** @type {any} */ err) {
      // A permit that saved but did not download is still issued — say so, and how to get it.
      issueError = saved
        ? `Permit ${permitNumberLabel(saved.permit_number)} was issued, but the file could not be made: ${errMessage(err)} Use ⬇ PDF in the list to try again.`
        : errMessage(err, 'The permit could not be issued.');
    } finally { issuing = false; }
  }

  // ── List ──────────────────────────────────────────────────────────────
  let q = '';
  let show = 'all';
  $: day = today();
  $: shown = $permitStore.permits
    .filter((p) => show === 'all' || permitStatus(p, day) === show)
    .filter((p) => matchesSearch([permitNumberLabel(p.permit_number), p.company, p.registration, p.issued_by], q));

  let downloadingId = null;
  let listError = '';
  async function redownload(p) {
    downloadingId = p.id; listError = '';
    try { await download(p); }
    catch (/** @type {any} */ err) { listError = errMessage(err, 'The permit file could not be made.'); }
    finally { downloadingId = null; }
  }

  // A sample permit for checking the template. Nothing is recorded, and it is
  // marked SAMPLE in its company field so a printed copy cannot pass for real.
  async function preview() {
    listError = '';
    const from = today();
    try {
      await download({
        permit_number: Math.max($permitStore.template?.first_number ?? 1, ($permitStore.permits[0]?.permit_number ?? 0) + 1),
        sample: true, company: 'SAMPLE — not a valid permit', registration: 'AB12 CDE',
        valid_from: from, valid_to: validToFor(from, 'week'), issued_by: me || 'Building manager',
      });
    } catch (/** @type {any} */ err) { listError = errMessage(err, 'The preview could not be made.'); }
  }

  let pendingDelete = null;
  let deleting = false;
  async function confirmDelete() {
    const target = pendingDelete;
    deleting = true; listError = '';
    try { await permitStore.remove(target); }
    catch (/** @type {any} */ err) { listError = errMessage(err, 'The permit could not be deleted.'); }
    finally { deleting = false; pendingDelete = null; }
  }
</script>

{#if !ready}
  <LoadingSpinner text="Loading the parking permits…" />
{:else}
  {#if loadError}<ErrorDisplay message={loadError} />{/if}
  {#if $permitStore.error}<ErrorDisplay message={$permitStore.error} />{/if}

  <div class="grid gap-4 lg:grid-cols-[24rem_1fr]">
    <!-- Issue -->
    <section bind:this={issueSection} class="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3 self-start">
      <h3 class="text-white font-semibold">Issue a permit</h3>
      {#if !canEdit}
        <p class="text-sm text-slate-400">You can see the permits issued, but not issue one.</p>
      {:else}
        <FormInput label="Company" bind:value={form.company} required list="permit-companies" />
        <datalist id="permit-companies">{#each companies as c}<option value={c}></option>{/each}</datalist>
        <FormInput label="Vehicle registration" bind:value={form.registration} required inputClass="uppercase" list="permit-registrations" />
        <datalist id="permit-registrations">{#each registrations as r}<option value={r}></option>{/each}</datalist>
        <div>
          <p class="text-xs text-slate-400 mb-1">For</p>
          <div class="flex gap-2">
            {#each PERMIT_DURATIONS as d}
              <button type="button" on:click={() => chooseDuration(d.key)}
                class="px-3 py-1.5 rounded text-sm border transition-colors
                       {duration === d.key ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}"
              >{d.label}</button>
            {/each}
            {#if duration === 'custom'}<span class="text-xs text-slate-400 self-center">Dates set by hand</span>{/if}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FormInput label="Valid from" type="date" bind:value={form.valid_from} on:change={fromChanged} required />
          <FormInput label="Valid to" type="date" bind:value={form.valid_to} min={form.valid_from} on:change={toChanged} required />
        </div>
        <FormInput label="Issued by" bind:value={form.issued_by} required />
        {#if issueError}<ErrorDisplay message={issueError} />{/if}
        {#if issuedNote}<p class="text-sm text-green-400" data-testid="issued-note">{issuedNote}</p>{/if}
        <Button on:click={issue} loading={issuing} disabled={issuing} fullWidth>Issue and download permit</Button>
        <p class="text-xs text-slate-500">The next number is given when you press the button. The permit is a PDF to print.</p>
      {/if}
    </section>

    <!-- Issued -->
    <section class="space-y-3 min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <input bind:value={q} placeholder="Search number, company, registration…"
          class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-72" />
        <select bind:value={show} class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
          <option value="all">All permits</option>
          <option value="current">In force today</option>
          <option value="upcoming">Not yet started</option>
          <option value="expired">Expired</option>
        </select>
        <span class="text-sm text-slate-400">{shown.length} of {$permitStore.permits.length}</span>
      </div>
      {#if listError}<ErrorDisplay message={listError} />{/if}

      {#if $permitStore.permits.length === 0}
        <p class="text-sm text-slate-400">No permits have been issued yet.</p>
      {:else}
        <div class="overflow-x-auto border border-slate-700 rounded-xl">
          <table class="w-full text-sm">
            <thead class="bg-slate-800 text-slate-400 text-xs uppercase">
              <tr>
                <th class="text-left px-3 py-2">No.</th>
                <th class="text-left px-3 py-2">Company</th>
                <th class="text-left px-3 py-2">Registration</th>
                <th class="text-left px-3 py-2">Valid</th>
                <th class="text-left px-3 py-2">Issued by</th>
                <th class="text-left px-3 py-2"></th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {#each shown as p (p.id)}
                {@const st = STATUS[permitStatus(p, day)]}
                <tr class="border-t border-slate-700/70 text-slate-200">
                  <td class="px-3 py-2 font-mono">{permitNumberLabel(p.permit_number)}</td>
                  <td class="px-3 py-2">{p.company}</td>
                  <td class="px-3 py-2 font-mono">{p.registration}</td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    {fmtDateOnly(p.valid_from)}{#if p.valid_to !== p.valid_from} – {fmtDateOnly(p.valid_to)}{/if}
                    <span class="text-slate-500">({permitDays(p)} {permitDays(p) === 1 ? 'day' : 'days'})</span>
                  </td>
                  <td class="px-3 py-2">{p.issued_by}</td>
                  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs {st.cls}">{st.label}</span></td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    {#if canEdit}
                      <Button size="small" variant="secondary" title="Fill in the form with this company and vehicle, for new dates"
                        on:click={() => reissue(p)}>↻ New permit like this</Button>
                    {/if}
                    <Button size="small" variant="secondary" loading={downloadingId === p.id}
                      disabled={!!downloadingId} on:click={() => redownload(p)}>⬇ PDF</Button>
                    {#if $permissions.isAdmin}
                      <Button size="small" variant="danger" on:click={() => pendingDelete = p}>Delete</Button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>

  {#if $permissions.isAdmin}
    <PermitTemplatePanel {building} on:preview={preview} />
  {/if}
{/if}

<ConfirmDialog show={!!pendingDelete} danger processing={deleting}
  title="Delete permit {pendingDelete ? permitNumberLabel(pendingDelete.permit_number) : ''}?"
  message="Only for a permit issued in error. Its number is not used again, and a printed copy still exists — collect it if you can."
  confirmText="Delete permit"
  on:confirm={confirmDelete} on:cancel={() => pendingDelete = null} />
