<!-- src/lib/apps/admin/components/StatutoryTemplatePanel.svelte -->
<!-- M4 · the statutory PPM template and its gap report, on Admin > Inspections.
     A building can hold a tidy list of obligations and still be missing a
     legally-required service; the worst compliance gap is the one that is
     invisible because the job never existed. This panel names what is absent.

     Coverage comes from statutory_obligations.template_key only — never from
     matching names. See src/lib/utils/statutoryTemplate.js. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import {
    templateCoverage, suggestMatches, intervalNote, BASIS_LABEL,
  } from '$lib/utils/statutoryTemplate.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';

  export let definitions = [];

  const dispatch = createEventDispatcher();

  $: dismissedKeys = $inspectionDefinitionsStore.dismissedKeys ?? [];
  $: coverage    = templateCoverage(definitions, { dismissedKeys });
  $: suggestions = suggestMatches(definitions);

  let open = false;
  let showCovered = false;
  let showNotApplicable = false;
  let busy = false;
  let panelError = '';
  let applyReport = null;      // { created, failed } from the last apply

  // Open the panel by itself the first time there is something to answer for,
  // then leave it under the user's control — a panel that keeps reopening is
  // one people learn to close without reading.
  let autoOpened = false;
  $: if (!autoOpened && coverage.missing.length > 0) { open = true; autoOpened = true; }

  // -- Not applicable ----------------------------------------------------------
  let naEntry = null;          // template entry pending a "not applicable" mark
  let naReason = '';

  function askNotApplicable(entry) { naEntry = entry; naReason = ''; }

  async function confirmNotApplicable() {
    const entry = naEntry, reason = naReason;
    busy = true; panelError = '';
    try {
      await inspectionDefinitionsStore.setTemplateDismissed(entry.key, true, reason);
      naEntry = null;
    } catch (err) {
      panelError = err.message;
    } finally {
      busy = false;
    }
  }

  async function reinstate(key) {
    busy = true; panelError = '';
    try {
      await inspectionDefinitionsStore.setTemplateDismissed(key, false);
    } catch (err) {
      panelError = err.message;
    } finally {
      busy = false;
    }
  }

  // -- Apply -------------------------------------------------------------------
  async function apply(keys) {
    busy = true; panelError = ''; applyReport = null;
    try {
      const report = await inspectionDefinitionsStore.applyTemplate(keys);
      applyReport = report;
      if (report.created.length > 0) dispatch('applied', report);
    } catch (err) {
      panelError = err.message;
    } finally {
      busy = false;
    }
  }

  async function link(obligationId, key) {
    busy = true; panelError = '';
    try {
      await inspectionDefinitionsStore.linkToTemplate(obligationId, key);
    } catch (err) {
      panelError = err.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="tmpl" class:has-gaps={coverage.missing.length > 0}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="tmpl-head" on:click={() => (open = !open)}>
    <div class="th-left">
      <span class="chev" class:open>▸</span>
      <div>
        <p class="th-title">Statutory template</p>
        <p class="th-sub">
          {coverage.coveredCount} of {coverage.applicableCount} covered
          {#if coverage.notApplicable.length > 0}
            <span class="dot">·</span>{coverage.notApplicable.length} not applicable
          {/if}
        </p>
      </div>
    </div>
    <div class="th-right">
      {#if coverage.missing.length > 0}
        <span class="pill gap">{coverage.missing.length} not covered</span>
      {:else}
        <span class="pill ok">All covered</span>
      {/if}
      <div class="bar" title="{coverage.percent}%">
        <div class="bar-fill" style="width: {coverage.percent}%"></div>
      </div>
    </div>
  </div>

  {#if open}
    <div class="tmpl-body">
      <p class="blurb">
        The recurring safety obligations a higher-risk residential building in England is normally
        expected to hold. This is a checklist, not legal advice — intervals are the conventional
        ones and your own risk assessment may require more often. Mark anything this building
        does not have as <em>not applicable</em> so it stops counting against you.
      </p>

      {#if panelError}<ErrorDisplay message={panelError} onDismiss={() => (panelError = '')} />{/if}

      {#if applyReport}
        <div class="report" class:bad={applyReport.failed.length > 0}>
          {#if applyReport.created.length > 0}
            <p>✓ Added {applyReport.created.length} obligation{applyReport.created.length === 1 ? '' : 's'}.
              Each needs a scope — they currently match every component.</p>
          {/if}
          {#each applyReport.failed as f (f.key)}
            <p class="fail">⚠ {f.name} — {f.message}</p>
          {/each}
        </div>
      {/if}

      <!-- ── Gaps ───────────────────────────────────────────────────────── -->
      {#if coverage.missing.length > 0}
        <div class="sec-head">
          <h4>Not covered ({coverage.missing.length})</h4>
          <ProtectedButton requireAdmin={true} variant="primary" size="small"
            disabled={busy}
            on:click={() => apply(coverage.missing.map(m => m.entry.key))}>
            Add all {coverage.missing.length}
          </ProtectedButton>
        </div>

        <div class="rows">
          {#each coverage.missing as { entry, inactiveOnly } (entry.key)}
            {@const candidates = suggestions.get(entry.key) ?? []}
            <div class="row gap">
              <div class="row-main">
                <div class="row-title">
                  <span class="nm">{entry.name}</span>
                  <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                  {#if inactiveOnly}
                    <span class="badge off" title="An obligation exists for this but is switched off">Switched off</span>
                  {/if}
                </div>
                <p class="ref">{entry.statutoryRef}</p>
                <p class="desc">{entry.description}</p>
                <div class="meta">
                  <span class="freq">{frequencyLabel(entry.frequencyDays)}</span>
                  <span class="dot">·</span>
                  <span>{EVIDENCE_ROUTE_LABEL[entry.evidencedBy]}</span>
                </div>
                <p class="note">{intervalNote(entry)}</p>
                <p class="applies"><span class="applies-k">Applies when:</span> {entry.appliesWhen}</p>

                {#if candidates.length > 0}
                  <div class="suggest">
                    <p class="suggest-h">Already have one of these?</p>
                    {#each candidates.slice(0, 3) as c (c.obligation.id)}
                      <div class="suggest-row">
                        <span class="sug-nm">{c.obligation.name}</span>
                        <span class="sug-why">{c.reason}</span>
                        <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                          disabled={busy}
                          on:click={() => link(c.obligation.id, entry.key)}>
                          This one covers it
                        </ProtectedButton>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="row-actions">
                <ProtectedButton requireAdmin={true} variant="primary" size="small"
                  disabled={busy} on:click={() => apply([entry.key])}>Add</ProtectedButton>
                <Button variant="secondary" size="small"
                  disabled={busy} on:click={() => askNotApplicable(entry)}>Not applicable</Button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="all-clear">
          ✓ Every applicable template entry has an active obligation against it.
        </p>
      {/if}

      <!-- ── Covered ────────────────────────────────────────────────────── -->
      {#if coverage.covered.length > 0}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="sec-head toggle" on:click={() => (showCovered = !showCovered)}>
          <h4><span class="chev sm" class:open={showCovered}>▸</span> Covered ({coverage.covered.length})</h4>
        </div>
        {#if showCovered}
          <div class="rows">
            {#each coverage.covered as { entry, activeCount } (entry.key)}
              <div class="row done">
                <div class="row-main">
                  <div class="row-title">
                    <span class="tick">✓</span>
                    <span class="nm">{entry.name}</span>
                    <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                    {#if activeCount > 1}<span class="badge n">{activeCount} obligations</span>{/if}
                  </div>
                  <p class="ref">{entry.statutoryRef}</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- ── Not applicable ─────────────────────────────────────────────── -->
      {#if coverage.notApplicable.length > 0}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="sec-head toggle" on:click={() => (showNotApplicable = !showNotApplicable)}>
          <h4><span class="chev sm" class:open={showNotApplicable}>▸</span> Not applicable ({coverage.notApplicable.length})</h4>
        </div>
        {#if showNotApplicable}
          <div class="rows">
            {#each coverage.notApplicable as { entry } (entry.key)}
              <div class="row na">
                <div class="row-main">
                  <div class="row-title">
                    <span class="nm">{entry.name}</span>
                    <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                  </div>
                  <p class="ref">{entry.statutoryRef}</p>
                </div>
                <div class="row-actions">
                  <Button variant="secondary" size="small" disabled={busy}
                    on:click={() => reinstate(entry.key)}>Reinstate</Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<!-- Declaring a statutory obligation inapplicable is a compliance decision, so
     it asks for a reason and records it in the audit log as a warning. -->
<Modal show={!!naEntry} title="Not applicable to this building" size="medium"
       on:close={() => (naEntry = null)}>
  {#if naEntry}
    <div class="na-body">
      <p class="na-name">{naEntry.name}</p>
      <p class="na-ref">{naEntry.statutoryRef}</p>
      <p class="na-applies">This entry applies when: <em>{naEntry.appliesWhen}</em></p>
      <p class="na-warn">
        It will stop counting as a gap. If the building does have one, add the obligation instead —
        a service that is genuinely required and simply absent is what this report exists to find.
      </p>
      <FormTextarea
        label="Why does this not apply?"
        bind:value={naReason}
        rows={3}
        placeholder="e.g. No lift — four storeys, stairs only"
        helpText="Recorded in the audit log. Optional, but this is the note that answers the question later." />
      <div class="na-actions">
        <Button variant="secondary" disabled={busy} on:click={() => (naEntry = null)}>Cancel</Button>
        <Button variant="primary" disabled={busy} on:click={confirmNotApplicable}>
          {busy ? 'Saving…' : 'Mark not applicable'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>

<style>
  .tmpl {
    border: 1px solid rgb(71 85 105 / 0.5);
    border-radius: 10px;
    background: rgb(30 41 59 / 0.3);
    overflow: hidden;
  }
  .tmpl.has-gaps { border-color: rgb(251 191 36 / 0.4); }

  .tmpl-head {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.75rem 1rem; cursor: pointer;
  }
  .tmpl-head:hover { background: rgb(51 65 85 / 0.25); }
  .th-left { display: flex; align-items: center; gap: 0.6rem; }
  .th-title { font-weight: 600; color: rgb(226 232 240); font-size: 0.92rem; }
  .th-sub { font-size: 0.78rem; color: rgb(148 163 184); margin-top: 0.1rem; }
  .th-right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }

  .chev { display: inline-block; transition: transform 0.15s; color: rgb(148 163 184); }
  .chev.open { transform: rotate(90deg); }
  .chev.sm { font-size: 0.75rem; margin-right: 0.3rem; }

  .bar { width: 90px; height: 6px; border-radius: 3px; background: rgb(71 85 105 / 0.6); overflow: hidden; }
  .bar-fill { height: 100%; background: var(--lh-accent); transition: width 0.2s; }

  .pill { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.15rem 0.5rem; border-radius: 999px; }
  .pill.gap { background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .pill.ok  { background: rgb(34 197 94 / 0.18);  color: rgb(134 239 172); }

  .tmpl-body { padding: 0 1rem 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
  .blurb { font-size: 0.8rem; color: rgb(148 163 184); line-height: 1.5; border-left: 2px solid rgb(71 85 105 / 0.8); padding-left: 0.7rem; }

  .report { font-size: 0.82rem; color: rgb(134 239 172); background: rgb(34 197 94 / 0.1); border-radius: 6px; padding: 0.6rem 0.75rem; }
  .report.bad { color: rgb(203 213 225); background: rgb(251 191 36 / 0.1); }
  .report .fail { color: rgb(252 165 165); }

  .sec-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.25rem; }
  .sec-head.toggle { cursor: pointer; }
  .sec-head h4 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(148 163 184); font-weight: 600; }

  .rows { display: flex; flex-direction: column; gap: 0.5rem; }
  .row {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
    padding: 0.7rem 0.85rem; border-radius: 8px;
    background: rgb(15 23 42 / 0.45); border: 1px solid rgb(71 85 105 / 0.4);
  }
  .row.gap { border-left: 3px solid rgb(251 191 36 / 0.7); }
  .row.done { border-left: 3px solid rgb(34 197 94 / 0.6); }
  .row.na { opacity: 0.6; }
  .row-main { min-width: 0; }
  .row-title { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
  .nm { font-weight: 600; color: rgb(226 232 240); font-size: 0.88rem; }
  .tick { color: rgb(74 222 128); }

  .badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; white-space: nowrap; }
  .badge.statute  { background: rgb(248 113 113 / 0.18); color: rgb(252 165 165); }
  .badge.standard { background: rgb(56 189 248 / 0.16);  color: rgb(125 211 252); }
  .badge.off      { background: rgb(251 191 36 / 0.18);  color: rgb(252 211 77); }
  .badge.n        { background: rgb(71 85 105 / 0.5);    color: rgb(148 163 184); }

  .ref  { font-size: 0.74rem; color: rgb(148 163 184); margin-top: 0.2rem; font-style: italic; }
  .desc { font-size: 0.8rem; color: rgb(203 213 225); margin-top: 0.3rem; }
  .meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.76rem; color: rgb(148 163 184); margin-top: 0.35rem; }
  .freq { color: rgb(203 213 225); font-weight: 500; }
  .dot  { color: rgb(100 116 139); }
  .note { font-size: 0.72rem; color: rgb(100 116 139); margin-top: 0.2rem; }
  .applies { font-size: 0.74rem; color: rgb(148 163 184); margin-top: 0.3rem; }
  .applies-k { color: rgb(100 116 139); }

  .suggest { margin-top: 0.6rem; padding: 0.5rem 0.6rem; border-radius: 6px; background: rgb(56 189 248 / 0.07); border: 1px solid rgb(56 189 248 / 0.18); }
  .suggest-h { font-size: 0.72rem; color: rgb(125 211 252); margin-bottom: 0.35rem; }
  .suggest-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.15rem 0; }
  .sug-nm { font-size: 0.78rem; color: rgb(226 232 240); }
  .sug-why { font-size: 0.68rem; color: rgb(100 116 139); }

  .row-actions { display: flex; flex-direction: column; gap: 0.35rem; flex-shrink: 0; }
  .all-clear { font-size: 0.85rem; color: rgb(134 239 172); padding: 0.5rem 0; }

  .na-body { display: flex; flex-direction: column; gap: 0.6rem; }
  .na-name { font-weight: 600; color: rgb(226 232 240); }
  .na-ref { font-size: 0.78rem; color: rgb(148 163 184); font-style: italic; }
  .na-applies { font-size: 0.82rem; color: rgb(203 213 225); }
  .na-warn { font-size: 0.8rem; color: rgb(252 211 77); background: rgb(251 191 36 / 0.1); border-radius: 6px; padding: 0.5rem 0.65rem; line-height: 1.45; }
  .na-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; }
</style>
