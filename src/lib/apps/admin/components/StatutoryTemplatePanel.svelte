<!-- src/lib/apps/admin/components/StatutoryTemplatePanel.svelte -->
<!-- M4 · the periodic activity register and its gap report, on Admin >
     Inspections. Every recurring check identified for a higher-risk residential
     building, each saying WHERE IT COMES FROM (legislation / standard /
     contract / our own decision) and HOW IT IS DEALT WITH HERE (which sub-app,
     or nothing).

     Coverage comes from statutory_obligations.template_key only — never from
     matching names. See src/lib/utils/statutoryTemplate.js. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import {
    templateCoverage, suggestMatches, intervalNote, registerByGroup, basisTally,
    BASIS, BASIS_LABEL, BASIS_DESCRIPTION, GROUP_LABEL, HANDLED_BY_LABEL,
    isSchedulable, isRecurring, isUnhomed, isSuperseded, supersededNote,
    STATUTORY_TEMPLATE,
  } from '$lib/utils/statutoryTemplate.js';
  import {
    currentDecisions, isRecordableReason, reviewsDue, reviewState, REVIEW_SOON_DAYS,
  } from '$lib/utils/statutoryExclusions.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { fmtDate } from '$lib/utils/dates.js';
  import { profiles, profilesStore } from '$lib/stores/profiles.js';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import { EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';

  export let definitions = [];

  const dispatch = createEventDispatcher();

  $: dismissedKeys = $inspectionDefinitionsStore.dismissedKeys ?? [];
  $: exclusions  = $inspectionDefinitionsStore.exclusions ?? [];
  $: decisions   = currentDecisions(exclusions);

  // An exclusion nobody revisits is how a register stays green while the
  // building changes underneath it — "no dwelling is let on a relevant tenancy"
  // is exactly the kind of statement that quietly stops being true. The review
  // date was already being recorded; until now nothing ever showed it back.
  $: dueReviews = reviewsDue(exclusions, { withinDays: REVIEW_SOON_DAYS });
  $: overdueReviews = dueReviews.filter(d => reviewState(d.review_due) === 'overdue');
  $: coverage    = templateCoverage(definitions, { dismissedKeys });
  $: suggestions = suggestMatches(definitions);

  // Who decided, by name — a decision record that only says "a uuid decided
  // this" answers the question badly.
  $: personName = new Map(($profiles.list ?? []).map(p => [p.id, p.full_name]));
  onMount(() => { profilesStore.load(); });

  const grouped = registerByGroup();
  const tally   = basisTally();

  let open = false;
  let view = 'gaps';            // 'gaps' | 'all'
  let showLegend = false;
  let showCovered = false;
  let showElsewhere = false;
  let showNotApplicable = false;
  let showSuperseded = false;
  let busy = false;
  let panelError = '';
  let applyReport = null;

  // Open by itself the first time there is something to answer for, then leave
  // it under the user's control — a panel that keeps reopening is one people
  // learn to close without reading.
  let autoOpened = false;
  $: if (!autoOpened && coverage.missing.length > 0) { open = true; autoOpened = true; }

  // -- The recorded decision ---------------------------------------------------
  // Marking a check inapplicable, and reversing that, are BOTH decisions someone
  // may later have to justify, so both go through the same form and both demand
  // a reason. Nothing is edited or deleted — each is a new row in the log.
  let decisionEntry = null;      // register entry the decision is about
  let decisionKind = 'not_applicable';
  let decisionReason = '';
  let decisionReviewDue = '';

  function askDecision(entry, kind) {
    decisionEntry = entry;
    decisionKind = kind;
    decisionReason = '';
    decisionReviewDue = '';
  }

  $: reasonOk = isRecordableReason(decisionReason);

  async function confirmDecision() {
    const entry = decisionEntry, kind = decisionKind;
    const reason = decisionReason, reviewDue = decisionReviewDue;
    busy = true; panelError = '';
    try {
      await inspectionDefinitionsStore.recordExclusionDecision(entry.key, kind, reason, { reviewDue });
      decisionEntry = null;
    } catch (err) { panelError = err.message; } finally { busy = false; }
  }

  // -- Apply -------------------------------------------------------------------
  async function apply(keys) {
    busy = true; panelError = ''; applyReport = null;
    try {
      const report = await inspectionDefinitionsStore.applyTemplate(keys);
      applyReport = report;
      if (report.created.length > 0) dispatch('applied', report);
    } catch (err) { panelError = err.message; } finally { busy = false; }
  }

  async function link(obligationId, key) {
    busy = true; panelError = '';
    try { await inspectionDefinitionsStore.linkToTemplate(obligationId, key); }
    catch (err) { panelError = err.message; } finally { busy = false; }
  }

  // -- Display helpers ---------------------------------------------------------
  const cadence = e => (isRecurring(e) ? frequencyLabel(e.frequencyDays) : 'On event');
  $: coveredKeys = new Set(coverage.covered.map(c => c.entry.key));
  $: dismissedSet = new Set(dismissedKeys);

  function statusOf(entry) {
    // Withdrawn first: whether we happen to be doing something the law no
    // longer requires is not a compliance question, and without this branch a
    // repealed requirement fell through and read as a gap.
    if (isSuperseded(entry))         return { cls: 'na',   text: 'No longer required' };
    if (coveredKeys.has(entry.key))  return { cls: 'ok',   text: 'Scheduled here' };
    if (dismissedSet.has(entry.key)) return { cls: 'na',   text: 'Not applicable' };
    if (!isSchedulable(entry))       return isUnhomed(entry)
      ? { cls: 'gap', text: 'Nothing deals with it' }
      : { cls: 'else', text: HANDLED_BY_LABEL[entry.handledBy] };
    return { cls: 'gap', text: 'Not covered' };
  }
</script>

<div class="tmpl" class:has-gaps={coverage.missing.length > 0}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="tmpl-head" on:click={() => (open = !open)}>
    <div class="th-left">
      <span class="chev" class:open>▸</span>
      <div>
        <p class="th-title">Periodic activity register</p>
        <p class="th-sub">
          {STATUTORY_TEMPLATE.length} checks identified
          <span class="dot">·</span>{coverage.coveredCount} of {coverage.applicableCount} scheduled here
          {#if coverage.unhomed.length > 0}
            <span class="dot">·</span><span class="warn-text">{coverage.unhomed.length} with no home</span>
          {/if}
          {#if coverage.superseded.length > 0}
            <span class="dot">·</span>{coverage.superseded.length} no longer required
          {/if}
          {#if dueReviews.length > 0}
            <span class="dot">·</span><span class="warn-text">
              {dueReviews.length}
              {dueReviews.length === 1 ? 'exclusion' : 'exclusions'} to review
            </span>
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
        Every recurring check identified for a higher-risk residential building in England, from the
        legislation, the British Standards, our contracts and our own decisions. Each says where the
        requirement comes from and how it is dealt with here. Intervals are the conventional ones —
        your own risk assessment may require more often. Mark anything this building does not have as
        <em>not applicable</em> so it stops counting against you.
      </p>

      <!-- Where these come from — the legend that makes the badges mean something -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="legend-head" on:click={() => (showLegend = !showLegend)}>
        <span class="chev sm" class:open={showLegend}>▸</span>
        <span>Where these requirements come from</span>
        <span class="legend-counts">
          {#each BASIS as b (b)}<span class="badge {b}">{BASIS_LABEL[b]} {tally[b]}</span>{/each}
        </span>
      </div>
      {#if showLegend}
        <div class="legend">
          {#each BASIS as b (b)}
            <div class="legend-row">
              <span class="badge {b}">{BASIS_LABEL[b]}</span>
              <p>{BASIS_DESCRIPTION[b]}</p>
            </div>
          {/each}
          <p class="legend-note">
            A second line on each entry says whether the <em>interval</em> comes from that source or is
            established practice around a duty whose wording is qualitative.
          </p>
        </div>
      {/if}

      <div class="views">
        <button class="view-btn" class:on={view === 'gaps'} on:click={() => (view = 'gaps')}>Gaps and coverage</button>
        <button class="view-btn" class:on={view === 'all'}  on:click={() => (view = 'all')}>Full register ({STATUTORY_TEMPLATE.length})</button>
      </div>

      {#if panelError}<ErrorDisplay message={panelError} onDismiss={() => (panelError = '')} />{/if}

      {#if applyReport}
        <div class="report" class:bad={applyReport.failed.length > 0}>
          {#if applyReport.created.length > 0}
            <p>✓ Added {applyReport.created.length} obligation{applyReport.created.length === 1 ? '' : 's'}.
              Each needs a scope — they currently match every component.</p>
          {/if}
          {#each applyReport.failed as f (f.key)}<p class="fail">⚠ {f.name} — {f.message}</p>{/each}
        </div>
      {/if}

      {#if view === 'all'}
        <!-- ══ Full register ══════════════════════════════════════════════ -->
        {#each [...grouped] as [group, entries] (group)}
          <div class="sec-head"><h4>{GROUP_LABEL[group]} ({entries.length})</h4></div>
          <div class="rows tight">
            {#each entries as entry (entry.key)}
              {@const st = statusOf(entry)}
              <div class="row compact">
                <div class="row-main">
                  <div class="row-title">
                    <span class="nm">{entry.name}</span>
                    <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                  </div>
                  <p class="ref">{entry.statutoryRef}</p>
                </div>
                <div class="row-facts">
                  <span class="freq">{cadence(entry)}</span>
                  <span class="status {st.cls}">{st.text}</span>
                </div>
              </div>
            {/each}
          </div>
        {/each}

      {:else}
        <!-- ══ Gaps ═══════════════════════════════════════════════════════ -->
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
                    {#if isUnhomed(entry)}
                      <span class="badge nohome" title="Nothing in the portal deals with this today">No home</span>
                    {/if}
                    {#if inactiveOnly}
                      <span class="badge off" title="An obligation exists for this but is switched off">Switched off</span>
                    {/if}
                  </div>
                  <p class="ref">{entry.statutoryRef}</p>
                  <p class="desc">{entry.description}</p>
                  <div class="meta">
                    <span class="freq">{cadence(entry)}</span>
                    <span class="dot">·</span>
                    <span>{EVIDENCE_ROUTE_LABEL[entry.evidencedBy]}</span>
                    <span class="dot">·</span>
                    <span>{entry.responsibleParty}</span>
                  </div>
                  <p class="note">{intervalNote(entry)}</p>
                  <p class="applies"><span class="applies-k">Applies when:</span> {entry.appliesWhen}</p>
                  {#if entry.handlingNote}<p class="hnote">{entry.handlingNote}</p>{/if}

                  {#if candidates.length > 0}
                    <div class="suggest">
                      <p class="suggest-h">Already have one of these?</p>
                      {#each candidates.slice(0, 3) as c (c.obligation.id)}
                        <div class="suggest-row">
                          <span class="sug-nm">{c.obligation.name}</span>
                          <span class="sug-why">{c.reason}</span>
                          <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                            disabled={busy} on:click={() => link(c.obligation.id, entry.key)}>
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
                    disabled={busy} on:click={() => askDecision(entry, 'not_applicable')}>Not applicable</Button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="all-clear">✓ Every applicable entry this library schedules has an active obligation.</p>
        {/if}

        <!-- Nothing in the portal deals with these — the honest system-level gap -->
        {#if coverage.unhomed.length > 0}
          <div class="sec-head"><h4>Nothing deals with these ({coverage.unhomed.length})</h4></div>
          <p class="sub-blurb">
            Identified, real, and outside what any sub-app currently covers. They are not schedulable
            here either — recorded so they are not mistaken for an oversight.
          </p>
          <div class="rows tight">
            {#each coverage.unhomed as { entry } (entry.key)}
              <div class="row nohome-row">
                <div class="row-main">
                  <div class="row-title">
                    <span class="nm">{entry.name}</span>
                    <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                  </div>
                  <p class="ref">{entry.statutoryRef}</p>
                  {#if entry.handlingNote}<p class="hnote">{entry.handlingNote}</p>{/if}
                </div>
                <div class="row-facts"><span class="freq">{cadence(entry)}</span></div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Handled by another app's own cycle -->
        {#if coverage.elsewhere.length > 0}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="sec-head toggle" on:click={() => (showElsewhere = !showElsewhere)}>
            <h4><span class="chev sm" class:open={showElsewhere}>▸</span> Tracked in another app ({coverage.elsewhere.length})</h4>
          </div>
          {#if showElsewhere}
            <p class="sub-blurb">
              These already have their own cycle elsewhere in the portal. Adding an obligation would put a
              second, competing due date on the same thing.
            </p>
            <div class="rows tight">
              {#each coverage.elsewhere as { entry } (entry.key)}
                <div class="row else-row">
                  <div class="row-main">
                    <div class="row-title">
                      <span class="nm">{entry.name}</span>
                      <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                      <span class="badge app">{HANDLED_BY_LABEL[entry.handledBy]}</span>
                    </div>
                    {#if entry.handlingNote}<p class="hnote">{entry.handlingNote}</p>{/if}
                  </div>
                  <div class="row-facts"><span class="freq">{cadence(entry)}</span></div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- No longer required — withdrawn, but still shown. Deleting the
             entry is what we are deliberately not doing. -->
        {#if coverage.superseded.length > 0}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="sec-head toggle" on:click={() => (showSuperseded = !showSuperseded)}>
            <h4><span class="chev sm" class:open={showSuperseded}>▸</span> No longer required ({coverage.superseded.length})</h4>
          </div>
          {#if showSuperseded}
            <p class="sub-blurb">
              Withdrawn — repealed, superseded, or the standard withdrawn. Kept in the register because
              work done under them before that date is still evidence and still has to make sense.
            </p>
            <div class="rows tight">
              {#each coverage.superseded as { entry } (entry.key)}
                <div class="row na">
                  <div class="row-main">
                    <div class="row-title">
                      <span class="nm">{entry.name}</span>
                      <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                    </div>
                    <p class="ref">{entry.statutoryRef}</p>
                    <p class="hnote">{supersededNote(entry)}</p>
                  </div>
                  <div class="row-facts"><span class="freq">{cadence(entry)}</span></div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- Covered -->
        {#if coverage.covered.length > 0}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="sec-head toggle" on:click={() => (showCovered = !showCovered)}>
            <h4><span class="chev sm" class:open={showCovered}>▸</span> Covered ({coverage.covered.length})</h4>
          </div>
          {#if showCovered}
            <div class="rows tight">
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

        <!-- Not applicable -->
        {#if coverage.notApplicable.length > 0}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="sec-head toggle" on:click={() => (showNotApplicable = !showNotApplicable)}>
            <h4>
              <span class="chev sm" class:open={showNotApplicable}>▸</span>
              Not applicable ({coverage.notApplicable.length})
              {#if dueReviews.length > 0}
                <span class="rev-flag" class:late={overdueReviews.length > 0}>
                  {dueReviews.length} to review
                </span>
              {/if}
            </h4>
          </div>
          {#if showNotApplicable}
            <div class="rows tight">
              {#each coverage.notApplicable as { entry } (entry.key)}
                {@const d = decisions.get(entry.key)}
                <div class="row na">
                  <div class="row-main">
                    <div class="row-title">
                      <span class="nm">{entry.name}</span>
                      <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                      {#if d?.review_due}
                        {@const rs = reviewState(d.review_due)}
                        <span class="badge rev {rs}">
                          {#if rs === 'overdue'}Review overdue — {fmtDate(d.review_due)}
                          {:else if rs === 'due_soon'}Review due {fmtDate(d.review_due)}
                          {:else}Review {fmtDate(d.review_due)}{/if}
                        </span>
                      {/if}
                    </div>
                    <p class="ref">{entry.statutoryRef}</p>
                    {#if d}
                      <p class="decision">“{d.reason}”</p>
                      <p class="decision-by">
                        Decided {fmtDate(d.decided_at)}{#if personName.get(d.decided_by)} by {personName.get(d.decided_by)}{/if}
                      </p>
                    {:else}
                      <p class="decision-by">No decision record found for this exclusion.</p>
                    {/if}
                  </div>
                  <div class="row-actions">
                    <Button variant="secondary" size="small" disabled={busy}
                      on:click={() => askDecision(entry, 'applicable')}>Reinstate</Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<!-- Deciding that a legal requirement does not apply to this building is a
     compliance decision someone may later be asked to justify. So it demands a
     reason, names the decider, timestamps itself, and is never edited or
     deleted — reversing it writes a second decision beside the first. -->
<Modal show={!!decisionEntry} size="medium"
       title={decisionKind === 'not_applicable' ? 'Record: not applicable to this building' : 'Record: applies after all'}
       on:close={() => (decisionEntry = null)}>
  {#if decisionEntry}
    <div class="na-body">
      <p class="na-name">{decisionEntry.name}</p>
      <p class="na-ref">{decisionEntry.statutoryRef}</p>
      <div class="na-badges">
        <span class="badge {decisionEntry.basis}">{BASIS_LABEL[decisionEntry.basis]}</span>
        <span class="na-basis">{BASIS_DESCRIPTION[decisionEntry.basis]}</span>
      </div>
      <p class="na-applies">This entry applies when: <em>{decisionEntry.appliesWhen}</em></p>

      {#if decisionKind === 'not_applicable'}
        {#if decisionEntry.basis === 'statute'}
          <p class="na-warn statute-warn">
            ⚠ This is a <strong>legal requirement</strong>. Recording it as not applicable is a decision
            about the law’s application to this building, not a preference. Your reason is what a BSR
            assessor, a new director or an insurer will be shown if they ask why it is absent.
          </p>
        {:else}
          <p class="na-warn">
            It will stop counting as a gap. If the building does have one, add the obligation instead —
            a check that is genuinely required and simply absent is what this report exists to find.
          </p>
        {/if}
      {:else}
        <p class="na-warn">
          This reinstates the check. The earlier decision stays in the record; this is recorded beside it,
          not in place of it.
        </p>
      {/if}

      <FormTextarea
        label={decisionKind === 'not_applicable' ? 'Why does this not apply?' : 'Why does it apply after all?'}
        bind:value={decisionReason}
        rows={3}
        required={true}
        placeholder={decisionKind === 'not_applicable'
          ? 'e.g. No lift — four storeys, stairs only'
          : 'e.g. Passenger lift installed March 2027'}
        helpText="Required. This is the decision record, not a note to yourself — write what would answer the question in three years." />

      {#if decisionKind === 'not_applicable'}
        <FormInput
          label="Review this decision on (optional)"
          type="date"
          bind:value={decisionReviewDue}
          helpText="Use it where the answer could change. “No lift” is stable; “no dwelling is let on a relevant tenancy” is not." />
      {/if}

      <div class="na-actions">
        <Button variant="secondary" disabled={busy} on:click={() => (decisionEntry = null)}>Cancel</Button>
        <Button variant="primary" disabled={busy || !reasonOk} on:click={confirmDecision}>
          {busy ? 'Recording…' : 'Record decision'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>

<style>
  .tmpl { border: 1px solid rgb(71 85 105 / 0.5); border-radius: 10px; background: rgb(30 41 59 / 0.3); overflow: hidden; }
  .tmpl.has-gaps { border-color: rgb(251 191 36 / 0.4); }

  .tmpl-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; cursor: pointer; }
  .tmpl-head:hover { background: rgb(51 65 85 / 0.25); }
  .th-left { display: flex; align-items: center; gap: 0.6rem; }
  .th-title { font-weight: 600; color: rgb(226 232 240); font-size: 0.92rem; }
  .th-sub { font-size: 0.78rem; color: rgb(148 163 184); margin-top: 0.1rem; }
  .th-right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
  .warn-text { color: rgb(252 211 77); }

  .chev { display: inline-block; transition: transform 0.15s; color: rgb(148 163 184); }
  .chev.open { transform: rotate(90deg); }
  .chev.sm { font-size: 0.75rem; margin-right: 0.3rem; }

  .bar { width: 90px; height: 6px; border-radius: 3px; background: rgb(71 85 105 / 0.6); overflow: hidden; }
  .bar-fill { height: 100%; background: var(--lh-accent); transition: width 0.2s; }

  .pill { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.15rem 0.5rem; border-radius: 999px; }
  .pill.gap { background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .pill.ok  { background: rgb(34 197 94 / 0.18);  color: rgb(134 239 172); }

  .tmpl-body { padding: 0 1rem 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
  .blurb { font-size: 0.8rem; color: rgb(148 163 184); line-height: 1.5; border-left: 2px solid rgb(71 85 105 / 0.8); padding-left: 0.7rem; }
  .sub-blurb { font-size: 0.76rem; color: rgb(100 116 139); line-height: 1.45; }

  .legend-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; cursor: pointer; font-size: 0.78rem; color: rgb(148 163 184); }
  .legend-counts { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-left: auto; }
  .legend { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.65rem 0.8rem; border-radius: 8px; background: rgb(15 23 42 / 0.5); border: 1px solid rgb(71 85 105 / 0.4); }
  .legend-row { display: grid; grid-template-columns: 150px 1fr; gap: 0.6rem; align-items: start; }
  .legend-row p { font-size: 0.76rem; color: rgb(148 163 184); line-height: 1.45; }
  .legend-note { font-size: 0.74rem; color: rgb(100 116 139); border-top: 1px solid rgb(71 85 105 / 0.4); padding-top: 0.45rem; }

  .views { display: flex; gap: 0.4rem; }
  .view-btn { font-size: 0.76rem; padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid rgb(71 85 105 / 0.6); background: transparent; color: rgb(148 163 184); cursor: pointer; }
  .view-btn.on { background: rgb(var(--lh-accent-rgb) / 0.15); border-color: rgb(var(--lh-accent-rgb) / 0.5); color: rgb(226 232 240); }

  .report { font-size: 0.82rem; color: rgb(134 239 172); background: rgb(34 197 94 / 0.1); border-radius: 6px; padding: 0.6rem 0.75rem; }
  .report.bad { color: rgb(203 213 225); background: rgb(251 191 36 / 0.1); }
  .report .fail { color: rgb(252 165 165); }

  .sec-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.25rem; }
  .sec-head.toggle { cursor: pointer; }
  .sec-head h4 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(148 163 184); font-weight: 600; }

  .rows { display: flex; flex-direction: column; gap: 0.5rem; }
  .rows.tight { gap: 0.25rem; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 0.7rem 0.85rem; border-radius: 8px; background: rgb(15 23 42 / 0.45); border: 1px solid rgb(71 85 105 / 0.4); }
  .row.compact { padding: 0.45rem 0.7rem; align-items: center; }
  .row.gap { border-left: 3px solid rgb(251 191 36 / 0.7); }
  .row.done { border-left: 3px solid rgb(34 197 94 / 0.6); }
  .row.nohome-row { border-left: 3px solid rgb(248 113 113 / 0.6); }
  .row.else-row { border-left: 3px solid rgb(56 189 248 / 0.5); }
  .row.na { opacity: 0.6; }
  .row-main { min-width: 0; }
  .row-title { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
  .nm { font-weight: 600; color: rgb(226 232 240); font-size: 0.88rem; }
  .tick { color: rgb(74 222 128); }
  .row-facts { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }

  .badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; white-space: nowrap; }
  .badge.statute    { background: rgb(248 113 113 / 0.18); color: rgb(252 165 165); }
  .badge.standard   { background: rgb(56 189 248 / 0.16);  color: rgb(125 211 252); }
  .badge.contract   { background: rgb(167 139 250 / 0.18); color: rgb(196 181 253); }
  .badge.management { background: rgb(148 163 184 / 0.2);  color: rgb(203 213 225); }
  .badge.app        { background: rgb(var(--lh-accent-rgb) / 0.18); color: rgb(var(--lh-accent-rgb)); }
  .badge.nohome     { background: rgb(248 113 113 / 0.25); color: rgb(254 202 202); }
  .badge.off        { background: rgb(251 191 36 / 0.18);  color: rgb(252 211 77); }
  .badge.n          { background: rgb(71 85 105 / 0.5);    color: rgb(148 163 184); }

  /* A review date only earns colour once it is close. A future one stays as
     quiet as any other fact, so that a coloured one means something. */
  .badge.rev.scheduled { background: rgb(71 85 105 / 0.5);    color: rgb(148 163 184); }
  .badge.rev.due_soon  { background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .badge.rev.overdue   { background: rgb(248 113 113 / 0.25); color: rgb(254 202 202); }

  .rev-flag { margin-left: 0.5rem; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em;
              padding: 0.1rem 0.4rem; border-radius: 4px; white-space: nowrap;
              background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .rev-flag.late { background: rgb(248 113 113 / 0.25); color: rgb(254 202 202); }

  .status { font-size: 0.68rem; padding: 0.1rem 0.45rem; border-radius: 4px; white-space: nowrap; }
  .status.ok   { background: rgb(34 197 94 / 0.15);  color: rgb(134 239 172); }
  .status.gap  { background: rgb(251 191 36 / 0.15); color: rgb(252 211 77); }
  .status.else { background: rgb(56 189 248 / 0.14); color: rgb(125 211 252); }
  .status.na   { background: rgb(71 85 105 / 0.4);   color: rgb(148 163 184); }

  .ref  { font-size: 0.74rem; color: rgb(148 163 184); margin-top: 0.2rem; font-style: italic; }
  .desc { font-size: 0.8rem; color: rgb(203 213 225); margin-top: 0.3rem; }
  .meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.76rem; color: rgb(148 163 184); margin-top: 0.35rem; flex-wrap: wrap; }
  .freq { color: rgb(203 213 225); font-weight: 500; font-size: 0.76rem; }
  .dot  { color: rgb(100 116 139); }
  .note { font-size: 0.72rem; color: rgb(100 116 139); margin-top: 0.2rem; }
  .applies { font-size: 0.74rem; color: rgb(148 163 184); margin-top: 0.3rem; }
  .applies-k { color: rgb(100 116 139); }
  .hnote { font-size: 0.74rem; color: rgb(125 211 252); margin-top: 0.3rem; }

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
  .na-badges { display: flex; align-items: flex-start; gap: 0.5rem; }
  .na-basis { font-size: 0.76rem; color: rgb(148 163 184); line-height: 1.45; }
  .statute-warn { color: rgb(252 165 165); background: rgb(248 113 113 / 0.12); }
  .decision { font-size: 0.8rem; color: rgb(203 213 225); margin-top: 0.3rem; font-style: italic; }
  .decision-by { font-size: 0.72rem; color: rgb(100 116 139); margin-top: 0.15rem; }
</style>
