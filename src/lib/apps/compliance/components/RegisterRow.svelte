<!-- src/lib/apps/compliance/components/RegisterRow.svelte -->
<!-- One compliance obligation in the register list: the line you scan, and the
     detail it opens into. Moved out of StatutoryTemplatePanel on 2026-10-03
     (PROJECT_STATUS §6bbb item 5) — the markup is unchanged; the panel's
     state reaches it as props and its actions leave as events, which the panel
     handles exactly as it did before.

     ⚠ `showDisplayRegister` is FORWARDED by the panel (on:showDisplayRegister
     with no handler) to the tab, then the shell. A hop dropped anywhere leaves a
     link that renders, clicks and does nothing; displayLinkChain.test.js checks
     every hop. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { isDisplayDuty } from '../utils/displayRegisterLink.js';
  import {
    intervalNote, BASIS_LABEL, HANDLED_BY_LABEL, isRecurring, supersededNote,
    triggerTypeOf, TRIGGER_TYPE_LABEL,
  } from '#lib/utils/statutoryTemplate.js';
  import { reviewState } from '#lib/utils/statutoryExclusions.js';
  import { frequencyLabel } from '#lib/utils/inspectionSchedule.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import {
    REGISTER_STATUS_LABEL, REGISTER_STATUS_CLASS, dutyHolderRole, DUTY_HOLDER_ROLE_LABEL, rowFacetSummary,
  } from '../utils/registerFilter.js';
  import { EVIDENCE_ROUTE_LABEL } from '#lib/utils/obligationEvidence.js';
  import Button from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';

  /** A register entry. */
  export let entry;
  /** Its REGISTER_STATUS for this building. */
  export let status;
  /** @type {{ inactiveOnly?: boolean, activeCount?: number }} */
  export let meta = {};
  /** Whether the detail is open. */
  export let open = false;
  /** @type {Record<string, any> | null | undefined} The current applicability decision, if any. */
  export let decision = null;
  /** @type {Record<string, Set<string>>} The panel's facet filters — the values filtered on are brightened. */
  export let filters = {};
  export let busy = false;
  export let canEditRegister = false;
  /** @type {{ origin?: string, seedModifiedAt?: string | null }} Where this row came from. */
  export let provenance = {};
  /** @type {Array<{ obligation: Record<string, any>, reason: string }>} Planned obligations that may already cover it. */
  export let candidates = [];
  /** @type {string | null} Who recorded the decision. */
  export let decidedByName = null;

  const dispatch = createEventDispatcher();

  const cadence = e => (isRecurring(e) ? frequencyLabel(e.frequencyDays) : 'On event');

  /** A proposed scope, in words. Deliberately terse — the authority is the
   *  scope editor in the obligation, this is only a statement of intent. */
  function scopeSummary(scope) {
    const bits = [];
    if (scope?.typeCodes?.length) bits.push(scope.typeCodes.join(', '));
    // The matcher's shape: defName + op (+ values). Read the same fields here,
    // or this line describes a filter the walk does not apply.
    for (const f of scope?.fixedAttrFilters ?? []) {
      const what = f.op === 'is_true' ? 'yes' : f.op === 'is_false' ? 'no'
        : Array.isArray(f.values) ? f.values.join(' or ') : `${f.op} ${f.values ?? ''}`.trim();
      bits.push(`${f.defName} = ${what}`);
    }
    if (scope?.systemIds?.length) bits.push(`${scope.systemIds.length} system(s)`);
    if (scope?.floorIds?.length)  bits.push(`${scope.floorIds.length} floor(s)`);
    return bits.join(' · ') || 'the whole building';
  }

  /** Months → the way a person says it. No instrument here sets a retention
   *  period, which is exactly why a bare number must not read as a minimum. */
  const retentionLabel = (months) =>
    months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`;
</script>

<div id="reg-row-{entry.key}" class="row {REGISTER_STATUS_CLASS[status]}" class:expanded={open}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="row-head" on:click={() => dispatch('toggle', entry.key)}>
    <span class="chev sm" class:open>▸</span>
    <div class="row-main">
      <div class="row-title">
        <span class="nm">{entry.name}</span>
        <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
        {#if meta.inactiveOnly}
          <span class="badge off" title="A planned obligation exists for this but is switched off">Switched off</span>
        {/if}
        {#if (meta.activeCount ?? 0) > 1}
          <span class="badge n" title="Planned obligations covering this">{meta.activeCount} planned</span>
        {/if}
        {#if status === 'elsewhere'}
          <span class="badge app">{HANDLED_BY_LABEL[entry.handledBy]}</span>
        {/if}
        {#if provenance.origin === 'local'}
          <span class="badge local"
            title="Added in this building, not from the standard register">Added here</span>
        {/if}
        {#if provenance.seedModifiedAt}
          <span class="badge modified"
            title="Edited here — no longer matches the standard register">Edited</span>
        {/if}
        {#if entry.operationallyIncomplete}
          <span class="badge incomplete"
            title="A temporary check standing in for a repair that has not happened. Checking often is not the same as fixing it.">⛔ Operationally incomplete</span>
        {/if}
        {#if decision?.review_due}
          {@const rs = reviewState(decision.review_due)}
          <span class="badge rev {rs}">
            {#if rs === 'overdue'}Review overdue — {fmtDate(decision.review_due)}
            {:else if rs === 'due_soon'}Review due {fmtDate(decision.review_due)}
            {:else}Review {fmtDate(decision.review_due)}{/if}
          </span>
        {/if}
      </div>
      {#if !open}
        <p class="ref">{entry.statutoryRef}</p>
        <!-- ⛔ A FACET MUST BE VISIBLE IN WHAT IT FILTERS.
             Evidence, Trigger, Duty holder and Citation are all
             filterable and none of them was on the row — Trigger
             was nowhere in the panel at all. Filtering by one and
             seeing no reason for the result is indistinguishable
             from a broken filter. Status, Source and Group are
             absent from this line ON PURPOSE: they are the pill,
             the badge and the section heading. -->
        <p class="facets">
          {#each rowFacetSummary(entry) as f, i (f.key)}
            {#if i > 0}<span class="dot">·</span>{/if}
            <span class="facet" class:on={filters[f.key]?.size} title={f.title}>{f.text}</span>
          {/each}
        </p>
      {/if}
    </div>
    <div class="row-facts">
      <span class="freq">{cadence(entry)}</span>
      <span class="status {REGISTER_STATUS_CLASS[status]}">{REGISTER_STATUS_LABEL[status]}</span>
    </div>
  </div>

  {#if open}
    <div class="row-detail">
      <p class="ref">{entry.statutoryRef}</p>
      {#if isDisplayDuty(entry.key)}
        <!-- The duty is discharged on a notice board, and the
             Display register is where the board is recorded. -->
        <p class="display-link">
          What is on the notice board is recorded on the Display register.
          <button type="button" class="link" on:click|stopPropagation={() => dispatch('showDisplayRegister')}>
            Open the Display register →
          </button>
        </p>
      {/if}

      <!-- ⚠ CITATION verified, not the row. The review that
           produced these says in terms that the intervals and the
           applicability conditions were NOT checked, so the label
           says exactly what was done and no more. A bare
           "verified" would be the overstatement this register
           exists to prevent. -->
      {#if entry.citationVerifiedAgainst}
        <p class="cite-ok">
          ✓ Citation verified against
          <a href={entry.citationVerifiedAgainst} target="_blank" rel="noopener">
            legislation.gov.uk</a>, {fmtDate(entry.citationVerifiedOn)}
          <span class="cite-scope">— the citation only; not the interval or whether it applies here</span>
        </p>
      {:else}
        <p class="cite-none">
          From the standard register — this row’s citation has not been individually recorded
        </p>
      {/if}
      <p class="desc">{entry.description}</p>
      <!-- ⚠ Trigger is here because it was in NO view before —
           filterable, and rendered nowhere. `cadence()` says
           "On event" for anything non-recurring, which collapses
           event, risk and direction into one word. -->
      <div class="meta">
        <span class="freq">{cadence(entry)}</span>
        <span class="dot">·</span>
        <span>{EVIDENCE_ROUTE_LABEL[entry.evidencedBy] ?? 'Not schedulable here'}</span>
        <span class="dot">·</span>
        <span title="What makes this fall due">
          {TRIGGER_TYPE_LABEL[triggerTypeOf(entry)]}-driven
        </span>
      </div>

      <!-- ⚠ Two different questions, and the register keeps them
           apart on purpose: who bears the duty IN LAW, and who
           does the work. Round 12 found "Responsible: Site staff"
           standing on rows whose duty is the responsible
           person's — the register asserting a statutory duty had
           moved to a cleaner. Shown as two labelled lines so the
           screen cannot reintroduce that. -->
      <p class="party">
        <span class="party-k">Duty holder in law:</span>
        {entry.statutoryDutyHolder ?? DUTY_HOLDER_ROLE_LABEL[dutyHolderRole(entry)]}
      </p>
      <p class="party">
        <span class="party-k">Performed by:</span> {entry.responsibleParty}
      </p>
      <p class="note">{intervalNote(entry)}</p>
      <p class="applies"><span class="applies-k">Applies when:</span> {entry.appliesWhen}</p>
      {#if entry.suggestedScope}
        <p class="applies">
          <span class="applies-k">Would cover:</span>
          {scopeSummary(entry.suggestedScope)}
          <span class="scope-ok">verified against this building’s component types</span>
        </p>
      {:else if entry.scopeNote}
        <p class="applies">
          <span class="applies-k">What it covers:</span> {entry.scopeNote}
        </p>
      {/if}

      {#if entry.triggerSource}
        <p class="applies">
          <span class="applies-k">What detects it:</span> {entry.triggerSource}
        </p>
      {/if}

      <!-- ⛔ Round 6: "the warning itself can become permanent".
           An unassigned completion action is conspicuous every
           time the row is read; a paragraph is not. The register
           has carried both fields since then and NOTHING in the
           app showed either, so on screen these nine rows read
           as ordinary ones. -->
      {#if entry.operationallyIncomplete}
        <div class="incomplete-box">
          <p class="incomplete-h">⛔ Operationally incomplete</p>
          <p>
            An interim measure against an open finding. It lacks the hazard, the residual
            risk, the technical authority, the escalation threshold, who may declare it
            unsafe, the permanent solution and its date.
          </p>
          <p class="incomplete-action">
            <span class="applies-k">Completion action:</span>
            {#if entry.completionAction}
              {entry.completionAction}
            {:else}
              <span class="not-assigned">NOT ASSIGNED</span>
            {/if}
          </p>
        </div>
      {/if}

      {#if entry.retentionBasis || entry.retentionPeriodMonths}
        <p class="applies">
          <span class="applies-k">Evidence retention:</span>
          {#if entry.retentionPeriodMonths}{retentionLabel(entry.retentionPeriodMonths)} — {/if}
          {entry.retentionBasis ?? 'basis not stated'}
        </p>
      {/if}

      {#if entry.handlingNote}<p class="hnote">{entry.handlingNote}</p>{/if}

      {#if status === 'superseded'}
        <p class="hnote">{supersededNote(entry)}</p>
      {/if}

      {#if status === 'no_home'}
        <p class="hnote">
          Identified, real, and outside what any sub-app currently covers — recorded so it
          is not mistaken for an oversight. It cannot be scheduled here.
        </p>
      {/if}

      {#if status === 'elsewhere'}
        <p class="hnote">
          Already has its own cycle in {HANDLED_BY_LABEL[entry.handledBy]}. Adding a
          planned obligation would put a second, competing due date on the same thing.
        </p>
      {/if}

      {#if status === 'not_applicable'}
        {#if decision}
          <p class="decision">“{decision.reason}”</p>
          <p class="decision-by">
            Decided {fmtDate(decision.decided_at)}{#if decidedByName} by {decidedByName}{/if}
          </p>
        {:else}
          <p class="decision-by">No decision record found for this exclusion.</p>
        {/if}
      {/if}

      {#if status === 'not_covered'}
                              {#if candidates.length > 0}
          <div class="suggest">
            <p class="suggest-h">Already have one of these?</p>
            {#each candidates.slice(0, 3) as c (c.obligation.id)}
              <div class="suggest-row">
                <span class="sug-nm">{c.obligation.name}</span>
                <span class="sug-why">{c.reason}</span>
                <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                  disabled={busy} on:click={() => dispatch('link', { obligationId: c.obligation.id, key: entry.key })}>
                  This one covers it
                </ProtectedButton>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <div class="row-actions">
        {#if status === 'not_covered'}
          <ProtectedButton requireAdmin={true} variant="primary" size="small"
            disabled={busy} on:click={() => dispatch('apply', [entry.key])}>Add to this building</ProtectedButton>
          <Button variant="secondary" size="small"
            disabled={busy} on:click={() => dispatch('decide', { entry, kind: 'not_applicable' })}>Mark not applicable</Button>
        {:else if status === 'not_applicable'}
          <Button variant="secondary" size="small" disabled={busy}
            on:click={() => dispatch('decide', { entry, kind: 'applicable' })}>Reinstate</Button>
        {/if}
        {#if canEditRegister}
          <ProtectedButton requireAdmin={true} variant="secondary" size="small"
            on:click={() => dispatch('edit', entry)}>Edit compliance obligation</ProtectedButton>
        {/if}
        {#if canEditRegister && provenance.origin === 'local'}
          <ProtectedButton requireAdmin={true} variant="danger" size="small"
            title="Only for a compliance obligation added here by mistake"
            on:click={() => dispatch('withdraw', entry)}>Withdraw</ProtectedButton>
        {/if}
      </div>
    </div>
  {/if}
</div>


<style>

  .status.part { background: rgb(251 191 36 / 0.16); color: rgb(252 211 77); }
  .row.part { border-color: rgb(251 191 36 / 0.35); }
  .badge.local { background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .badge.modified { background: rgb(148 163 184 / 0.22); color: rgb(203 213 225); }
  .badge.incomplete { background: rgb(248 113 113 / 0.18); color: rgb(252 165 165); text-transform: none; letter-spacing: 0; }
  .incomplete-box {
    margin-top: 0.35rem; padding: 0.5rem 0.65rem; border-radius: 6px;
    background: rgb(248 113 113 / 0.08); border: 1px solid rgb(248 113 113 / 0.35);
    font-size: 0.76rem; color: rgb(203 213 225); line-height: 1.45;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .incomplete-h { font-weight: 700; color: rgb(252 165 165); }
  .incomplete-action { margin-top: 0.1rem; }
  .not-assigned { font-weight: 700; color: rgb(252 165 165); letter-spacing: 0.03em; }
  .cite-ok { font-size: 0.75rem; color: rgb(134 239 172); line-height: 1.45; }
  .cite-ok a { color: rgb(134 239 172); text-decoration: underline; }
  .cite-scope { color: rgb(100 116 139); }
  .cite-none { font-size: 0.75rem; color: rgb(100 116 139); line-height: 1.45; }
  .scope-ok { color: rgb(134 239 172); font-size: 0.72rem; }
  .party { font-size: 0.76rem; color: rgb(148 163 184); line-height: 1.45; }
  .party-k { color: rgb(203 213 225); font-weight: 600; }
  /* The facet values on a collapsed row. Muted by default — they are context,
     not the point of the row — and lifted when that facet is being filtered on,
     so the reason a row survived the filter is the thing that stands out. */
  .facets { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.3rem;
            font-size: 0.7rem; color: rgb(100 116 139); margin-top: 0.15rem; }
  .facet.on { color: rgb(226 232 240); font-weight: 600; }

  /* ── Rows: compact, expanding in place ─────────────────────────────────── */
  .row-head { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; width: 100%; }
  .row-head .row-main { flex: 1; min-width: 0; }
  .display-link { font-size: 0.8rem; color: rgb(148 163 184); margin-top: 0.35rem; }
  .display-link .link { color: var(--lh-accent-light, rgb(94 234 212)); text-decoration: underline; margin-left: 0.25rem; }
  .row.expanded { border-color: rgb(var(--lh-accent-rgb) / 0.4); }
  .row-detail {
    margin-top: 0.55rem; padding-top: 0.55rem; padding-left: 1.1rem;
    border-top: 1px solid rgb(71 85 105 / 0.4);
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .row-detail .row-actions { margin-top: 0.4rem; display: flex; gap: 0.4rem; }

  .chev { display: inline-block; transition: transform 0.15s; color: rgb(148 163 184); }
  .chev.open { transform: rotate(90deg); }
  .chev.sm { font-size: 0.75rem; margin-right: 0.3rem; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 0.7rem 0.85rem; border-radius: 8px; background: rgb(15 23 42 / 0.45); border: 1px solid rgb(71 85 105 / 0.4); }
  .row.gap { border-left: 3px solid rgb(251 191 36 / 0.7); }
  .row.na { opacity: 0.6; }
  .row-main { min-width: 0; }
  .row-title { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
  .nm { font-weight: 600; color: rgb(226 232 240); font-size: 0.88rem; }
  .row-facts { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }

  .badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; white-space: nowrap; }
  .badge.statute    { background: rgb(248 113 113 / 0.18); color: rgb(252 165 165); }
  .badge.standard   { background: rgb(56 189 248 / 0.16);  color: rgb(125 211 252); }
  .badge.contract   { background: rgb(167 139 250 / 0.18); color: rgb(196 181 253); }
  .badge.management { background: rgb(148 163 184 / 0.2);  color: rgb(203 213 225); }
  .badge.app        { background: rgb(var(--lh-accent-rgb) / 0.18); color: rgb(var(--lh-accent-rgb)); }
  .badge.off        { background: rgb(251 191 36 / 0.18);  color: rgb(252 211 77); }
  .badge.n          { background: rgb(71 85 105 / 0.5);    color: rgb(148 163 184); }

  /* A review date only earns colour once it is close. A future one stays as
     quiet as any other fact, so that a coloured one means something. */
  .badge.rev.scheduled { background: rgb(71 85 105 / 0.5);    color: rgb(148 163 184); }
  .badge.rev.due_soon  { background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .badge.rev.overdue   { background: rgb(248 113 113 / 0.25); color: rgb(254 202 202); }

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
  .decision { font-size: 0.8rem; color: rgb(203 213 225); margin-top: 0.3rem; font-style: italic; }
  .decision-by { font-size: 0.72rem; color: rgb(100 116 139); margin-top: 0.15rem; }
</style>
