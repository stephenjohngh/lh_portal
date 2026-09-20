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
    templateCoverage, suggestMatches, intervalNote, basisTally,
    BASIS, BASIS_LABEL, BASIS_DESCRIPTION, HANDLED_BY_LABEL,
    isRecurring, supersededNote, triggerTypeOf, TRIGGER_TYPE_LABEL,
  } from '$lib/utils/statutoryTemplate.js';
  import {
    currentDecisions, isRecordableReason, reviewsDue, reviewState, REVIEW_SOON_DAYS,
  } from '$lib/utils/statutoryExclusions.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { fmtDate } from '$lib/utils/dates.js';
  import { profiles, profilesStore } from '$lib/stores/profiles.js';
  import { statutoryRegister } from '$lib/stores/statutoryRegister.js';
  import RegisterEntryModal from './RegisterEntryModal.svelte';
  import RegisterImportDiff from './RegisterImportDiff.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FilterBar from '$lib/components/common/FilterBar.svelte';
  import {
    filterRegister, registerStatusTally, groupRegisterRows, registerFilterFields,
    REGISTER_STATUS, REGISTER_STATUS_LABEL, REGISTER_STATUS_CLASS,
    dutyHolderTally, dutyHolderRole, DUTY_HOLDER_ROLE_LABEL,
    citationState, rowFacetSummary,
  } from '../utils/registerFilter.js';
  import { downloadRegisterXlsx, downloadRegisterDocx } from '../utils/registerDownloads.js';
  import { ofKind, kindTally, REGISTER_KINDS } from '$lib/utils/registerKinds.js';
  import { inAuthorOrder, KIND_SECTION } from '../utils/registerItemView.js';
  import RegisterItemsList from './RegisterItemsList.svelte';
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
  onMount(() => {
    profilesStore.load();
    // R1: the catalogue comes from the database where it has been imported, and
    // from the shipped seed until then. The store handles the fallback; nothing
    // here has to care which it got.
    statutoryRegister.load();
  });

  // ⚠ Read through the store rather than the seed constant, so the panel
  // re-renders when the register loads. `$statutoryRegister.entries` IS the
  // active register — the pure helpers are pointed at the same list.
  $: REG = $statutoryRegister.entries;

  // -- Which KIND you are looking at -------------------------------------------
  // ⭐ "Clear options to the user as to what they are seeing", which is the half
  // of folding everything in that the export alone did not do. The register
  // holds four kinds of row and until now the screen showed one of them: the
  // outstanding actions, the reasoned absences and the caveats reached the Word
  // file and no place a person could read them.
  //
  // ⛔ A KIND IS NEVER COUNTED AS ANOTHER. Each tab carries its own figure and
  // they are never added up — "118 requirements" must not quietly become 183.
  // `kindTally` accounts for every row it is given precisely so a kind cannot go
  // missing from this strip without the number failing to add up.
  /** @type {'requirement'|'action'|'absence'|'caveat'} */
  let kind = 'requirement';
  $: kinds = kindTally($statutoryRegister.items);
  $: kindBlurb = REGISTER_KINDS.find(k => k.key === kind)?.blurb ?? '';

  const tally   = basisTally();

  let open = false;
  let showLegend = false;
  let busy = false;
  let panelError = '';
  let applyReport = null;

  // -- Filtering ---------------------------------------------------------------
  // Status is a FILTER, not a view mode: "Gaps and coverage" and "Full register"
  // were two renderings of these same entries, and the gap list is simply
  // `status = not_covered`. It starts there because that is the work.
  let search = '';
  let filters = { status: new Set(['not_covered']) };
  let expanded = new Set();          // keys whose detail is showing
  let collapsedGroups = new Set();   // group keys the user has folded away

  function toggleRow(key) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    expanded = next;
  }

  function toggleGroup(group) {
    const next = new Set(collapsedGroups);
    if (next.has(group)) next.delete(group); else next.add(group);
    collapsedGroups = next;
  }

  /** The count strip is also the control — clicking a number filters to it. */
  function toggleStatus(s) {
    const next = new Set(filters.status ?? []);
    if (next.has(s)) next.delete(s); else next.add(s);
    filters = { ...filters, status: next };
  }

  // Open by itself the first time there is something to answer for, then leave
  // it under the user's control — a panel that keeps reopening is one people
  // learn to close without reading.
  // -- Collisions with the shipped register ------------------------------------
  // ⭐ THE ONLY PART OF THE SEED/TABLE RELATIONSHIP A PERSON SHOULD EVER SEE.
  // The store levels the table with the shipped register on load: it adds what
  // is missing and takes a release's correction on any row nobody here has
  // edited. Neither needs telling. What it will NOT do is overwrite a row
  // somebody here changed — so when a release also changes that same row, two
  // considered wordings exist and only a person can choose between them.
  //
  // ⚠ That is rare. It is zero today, which is exactly why it must not be a
  // standing button: "Check against the standard register" was on this screen
  // for every user, every day, to serve a case that had never once occurred.
  $: collisions = $statutoryRegister.source === 'database' && $statutoryRegister.loaded
    ? (statutoryRegister.previewImport()?.divergent ?? [])
    : [];

  // ── Exports ────────────────────────────────────────────────────────────────
  // ⚠ Both pass the rows the screen is showing, and the facets it is showing
  // them under, so each file records the filter it was taken from.
  // ⭐ They answer different questions: the spreadsheet carries EVERY field and
  // is for working the list; the Word file is a curated seven columns and is an
  // EXTRACT for showing somebody. It says so on its own first page, because the
  // thing it must never be mistaken for is the obligations statement.

  /** @type {'xlsx'|'docx'|'statement'|null} */
  let exporting = null;

  // ⭐ THE SECTIONS, AND THEY ARE WHAT MAKES ONE DOCUMENT DO BOTH JOBS. With
  // every section on and no filter applied, the Word file IS the obligations
  // statement; with a filter or a section off, it is honestly an extract of it
  // and says so. Nothing is passed to the server asking for one or the other —
  // the document decides from what it contains, so it can never carry a title
  // that contradicts its own contents.
  let sections = { caveats: true, absences: true, actions: true };

  $: isStatement = shown.length === REG.length
    && sections.caveats && sections.absences && sections.actions;

  async function runExport(kind) {
    exporting = kind; panelError = '';
    const args = {
      rows: shown,
      total: REG.length,
      fields: filterFields,
      values: filters,
      query: search,
      provenanceOf,
      sections,
      // ⛔ WHETHER THIS IS THIS BUILDING'S REGISTER AT ALL, and the file has to
      // say so. The note beside these buttons has always warned the reader; for
      // a day it promised "the file will say so" and the file said nothing,
      // because that banner lived in the statement builder that was deleted
      // when the statement stopped being a separate document.
      fromSeed: $statutoryRegister.source !== 'database',
      items: {
        caveats:  inAuthorOrder(ofKind($statutoryRegister.items, 'caveat')),
        absences: inAuthorOrder(ofKind($statutoryRegister.items, 'absence')),
        actions:  ofKind($statutoryRegister.items, 'action'),
      },
    };
    try {
      if (kind === 'xlsx') await downloadRegisterXlsx(args);
      else                 await downloadRegisterDocx(args);
    } catch (/** @type {any} */ err) {
      panelError = err.message ?? 'Could not build the document.';
    } finally {
      exporting = null;
    }
  }

  // -- Adding and editing requirements (R2) ------------------------------------
  // ⛔ Only once the catalogue is in the database. While the app is reading the
  // shipped seed there is nothing here that could be saved, and offering the
  // affordance anyway would be a button that cannot work.
  let editing = null;          // entry | null-for-new sentinel
  let showEntryModal = false;
  let savingEntry = false;

  $: canEditRegister = $statutoryRegister.source === 'database';
  $: provenanceOf = (key) => $statutoryRegister.provenance?.[key] ?? {};

  function addRequirement()  { editing = null; showEntryModal = true; }
  function editRequirement(entry) { editing = entry; showEntryModal = true; }

  async function saveEntry(ev) {
    const { key, entry: draft, isNew } = ev.detail;
    savingEntry = true; panelError = '';
    try {
      if (isNew) await statutoryRegister.create(draft);
      else       await statutoryRegister.edit(key, draft);
      showEntryModal = false; editing = null;
    } catch (/** @type {any} */ err) {
      panelError = err.message;
    } finally { savingEntry = false; }
  }

  // -- Checking the shipped standard register for changes (R3) -----------------
  let diff = null;
  let diffBusy = false;

  function checkForUpdates() { panelError = ''; diff = statutoryRegister.previewImport(); }

  async function applyDiff(ev) {
    diffBusy = true; panelError = '';
    try {
      await statutoryRegister.applyFromSeed(ev.detail);
      diff = statutoryRegister.previewImport();      // re-read, never assume
    } catch (/** @type {any} */ err) {
      panelError = err.message;
    } finally { diffBusy = false; }
  }

  // -- Withdrawing a requirement added here in error ---------------------------
  // ⚠ The affordance has to say when NOT to use it. A requirement that exists in
  // law but does not apply to this building is a RECORDED DECISION, not a
  // delete — that distinction is the register's own rule and the easiest thing
  // for a hurried person to get wrong.
  let withdrawing = null;
  let withdrawReason = '';
  let withdrawBusy = false;

  function askWithdraw(entry) { withdrawing = entry; withdrawReason = ''; panelError = ''; }

  async function confirmWithdraw() {
    const target = withdrawing, reason = withdrawReason;
    withdrawBusy = true; panelError = '';
    try {
      await statutoryRegister.withdrawLocal(target.key, reason);
      withdrawing = null;
      if (diff) diff = statutoryRegister.previewImport();
    } catch (/** @type {any} */ err) {
      panelError = err.message;
      withdrawing = null;          // the reason is in the error; the panel shows it
    } finally { withdrawBusy = false; }
  }

  async function verifyCitation(ev) {
    const { key, url, on } = ev.detail;
    savingEntry = true; panelError = '';
    try {
      await statutoryRegister.recordCitationVerification(key, { url, on });
      showEntryModal = false; editing = null;
    } catch (/** @type {any} */ err) {
      panelError = err.message;
    } finally { savingEntry = false; }
  }

  function editFromDiff(ev) {
    const entry = $statutoryRegister.entries.find(e => e.key === ev.detail);
    if (entry) editRequirement(entry);
  }

  let autoOpened = false;
  $: if (!autoOpened && coverage.missing.length > 0) { open = true; autoOpened = true; }

  // -- The recorded decision ---------------------------------------------------
  // Marking a check inapplicable, and reversing that, are BOTH decisions someone
  // may later have to justify, so both go through the same form and both demand
  // a reason. Nothing is edited or deleted — each is a new row in the log.
  let decisionEntry = null;      // register entry the decision is about
  /** @type {'not_applicable'|'applicable'} */
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
    } catch (/** @type {any} */ err) { panelError = err.message; } finally { busy = false; }
  }

  // -- Apply -------------------------------------------------------------------
  async function apply(keys) {
    busy = true; panelError = ''; applyReport = null;
    try {
      const report = await inspectionDefinitionsStore.applyTemplate(keys);
      applyReport = report;
      if (report.created.length > 0) dispatch('applied', report);
    } catch (/** @type {any} */ err) { panelError = err.message; } finally { busy = false; }
  }

  async function link(obligationId, key) {
    busy = true; panelError = '';
    try { await inspectionDefinitionsStore.linkToTemplate(obligationId, key); }
    catch (/** @type {any} */ err) { panelError = err.message; } finally { busy = false; }
  }

  // -- Display helpers ---------------------------------------------------------
  const cadence = e => (isRecurring(e) ? frequencyLabel(e.frequencyDays) : 'On event');

  /** A proposed scope, in words. Deliberately terse — the authority is the
   *  scope editor in the obligation, this is only a statement of intent. */
  function scopeSummary(scope) {
    const bits = [];
    if (scope?.typeCodes?.length) bits.push(scope.typeCodes.join(', '));
    for (const f of scope?.fixedAttrFilters ?? []) bits.push(`${f.name} = ${f.value}`);
    if (scope?.systemIds?.length) bits.push(`${scope.systemIds.length} system(s)`);
    if (scope?.floorIds?.length)  bits.push(`${scope.floorIds.length} floor(s)`);
    return bits.join(' · ') || 'building-level — no component scope';
  }

  /** Months → the way a person says it. No instrument here sets a retention
   *  period, which is exactly why a bare number must not read as a minimum. */
  const retentionLabel = (months) =>
    months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`;
  $: coveredKeys = new Set(coverage.covered.map(c => c.entry.key));
  $: dismissedSet = new Set(dismissedKeys);

  // One status function for the whole panel, in registerFilter.js — see its
  // header for why this is not a set of hand-written sections any more.
  // Applied but not finished: an obligation exists, none of them is switched on.
  // ⚠ `templateCoverage` still counts these as MISSING, which is right — the
  // duty is not being discharged. This only tells the two apart on screen.
  $: awaitingKeys = new Set(
    coverage.missing.filter(m => m.inactiveOnly).map(m => m.entry.key));
  $: statusCtx = { coveredKeys, dismissedKeys: dismissedSet, awaitingKeys };
  $: tallies   = registerStatusTally(REG, statusCtx);
  $: dutyTally    = dutyHolderTally(REG);
  $: citationTally = REG.reduce((m, e) => {
    const k = citationState(e); m[k] = (m[k] ?? 0) + 1; return m;
  }, /** @type {Record<string, number>} */ ({}));
  $: filterFields = registerFilterFields(tallies, dutyTally, citationTally);
  $: shown     = filterRegister(REG, { ...filters, q: search }, statusCtx);
  $: groups    = groupRegisterRows(shown);

  // "N of M" per group heading needs the unfiltered total for that group.
  $: groupTotals = REG.reduce((m, e) => {
    m[e.group] = (m[e.group] ?? 0) + 1; return m;
  }, /** @type {Record<string, number>} */ ({}));

  // Only entries that can actually be created — bulk apply must never offer to
  // add something the scheduler cannot date, nor a SECOND copy of one that
  // apply already created and left switched off.
  $: shownAddable = shown.filter(r => r.status === 'not_covered');

  // Per-row extras the coverage report knows and the register entry does not.
  $: rowMeta = new Map(/** @type {[string, {inactiveOnly?: boolean, activeCount?: number}][]} */ ([
    ...coverage.missing.map(m => [m.entry.key, { inactiveOnly: m.inactiveOnly }]),
    ...coverage.covered.map(c => [c.entry.key, { activeCount: c.activeCount }]),
  ]));
</script>

<div class="tmpl" class:has-gaps={coverage.missing.length > 0}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="tmpl-head" class:closed={!open} on:click={() => (open = !open)}>
    <div class="th-left">
      <span class="chev" class:open>▸</span>
      <div>
        <p class="th-title">Periodic activity register</p>
        <p class="th-sub">
          {REG.length} checks identified
          <span class="dot">·</span>{coverage.coveredCount} of {coverage.applicableCount} scheduled here
          {#if coverage.unhomed.length > 0}
            <span class="dot">·</span><span class="warn-text">{coverage.unhomed.length} with no home</span>
          {/if}
          {#if coverage.superseded.length > 0}
            <span class="dot">·</span>{coverage.superseded.length} no longer required
          {/if}
          <!-- ⚠ Its own figure, never added to the one on the left. An action is
               not a duty and the moment the two share a number, satisfying one
               starts reading as satisfying the other. -->
          {#if kinds.action > 0}
            <span class="dot">·</span><span class="warn-text">{kinds.action} outstanding</span>
          {/if}
          {#if dueReviews.length > 0}
            <span class="dot">·</span><span class="warn-text" class:late={overdueReviews.length > 0}>
              {dueReviews.length}
              {dueReviews.length === 1 ? 'exclusion' : 'exclusions'} to review{#if overdueReviews.length > 0}, {overdueReviews.length} overdue{/if}
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
      <!-- ⭐ WHAT YOU ARE LOOKING AT, said before anything else. The register
           holds four kinds of row and the screen used to show one; the other
           three reached the Word file and nowhere a person could read them.
           Each tab carries its OWN count and they are never summed — see the
           header of `registerKinds.js` for why that is a safeguard rather than
           a formatting choice. -->
      <div class="kinds">
        {#each REGISTER_KINDS as k (k.key)}
          <button class="kind" class:on={kind === k.key}
            disabled={kinds[k.key] === 0}
            on:click={() => (kind = k.key)}>
            <span class="kind-n">{kinds[k.key]}</span>
            <span class="kind-l">{k.label}</span>
          </button>
        {/each}
      </div>
      <p class="kind-blurb">{kindBlurb}</p>

      <!-- ⚠ Above the tab split, not inside it. An error raised while saving on
           one tab must not become invisible because the reader moved to another. -->
      {#if panelError}<ErrorDisplay message={panelError} onDismiss={() => (panelError = '')} />{/if}

      {#if kind !== 'requirement'}
        <RegisterItemsList
          {kind}
          items={$statutoryRegister.items}
          included={sections[KIND_SECTION[kind]]}
          on:include={e => (sections = { ...sections, [KIND_SECTION[kind]]: e.detail })}
        />
      {:else}
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



      <!-- ⭐ THERE IS NO IMPORT STEP AND NO "reading from application code"
           NOTICE, and their absence is the feature. The store levels the table
           with the shipped register on load — see `levelWithSeed`. How a row got
           here is deployment plumbing; the person looking at this screen came to
           decide which duties apply to this building and what discharges them.

           ⚠ The one thing that still needs a person is a genuine collision: a
           release changed a requirement AND somebody here edited the same one.
           That is the banner below, and it appears only when there is one. -->
      {#if collisions.length}
        <div class="collision">
          <p class="collision-h">
            {collisions.length} requirement{collisions.length === 1 ? '' : 's'} changed in
            the application, and {collisions.length === 1 ? 'was' : 'were'} also edited here
          </p>
          <p>
            Both versions are considered. Nothing has been overwritten — open each one and
            decide which wording is right for this building.
          </p>
          <Button variant="secondary" size="small" on:click={checkForUpdates}>
            Show me the differences
          </Button>
        </div>
      {/if}

      {#if applyReport}
        <div class="report" class:bad={applyReport.failed.length > 0}>
          {#if applyReport.created.length > 0}
            <p>
              ✓ Added {applyReport.created.length} obligation{applyReport.created.length === 1 ? '' : 's'},
              <strong>switched off</strong>. Nothing reaches the mobile app or the job scheduler until
              you turn each one on.
            </p>
            <p class="report-next">
              They are listed below as <em>Added — needs scope</em>. Where the register proposes a
              scope it has been applied; the rest match <strong>every component</strong> and are
              badged <em>Matches everything</em> in the list beneath this panel — filter Scope to
              <em>Matches everything</em> to work through them.
            </p>
          {/if}
          {#each applyReport.failed as f (f.key)}<p class="fail">⚠ {f.name} — {f.message}</p>{/each}
        </div>
      {/if}


      <!-- ══ The list ═══════════════════════════════════════════════════
           ONE list, one row template. "Gaps" and "Full register" used to be
           two views over these same 116 entries, differing only in row
           density — so a status could be computed one way for the badge and
           implied another way by which view you were in. Status is now a
           FILTER, and density is a per-row disclosure. -->

      <!-- The count strip doubles as the filter: the numbers you read are the
           control you click. It counts the WHOLE register, never the filtered
           view, because it is how a filter gets chosen. -->
      {#if canEditRegister}
        <div class="reg-actions">
          <ProtectedButton requireAdmin={true} variant="primary" size="small"
            on:click={addRequirement}>+ Add a requirement</ProtectedButton>
          <span class="reg-actions-note">
            Add a duty this building must meet that the register does not carry.
          </span>
        </div>
      {/if}

      {#if diff}
        <div class="diff-wrap">
          <RegisterImportDiff {diff} busy={diffBusy}
            on:apply={applyDiff} on:edit={editFromDiff} />
          <button class="diff-close" on:click={() => diff = null}>Close</button>
        </div>
      {/if}

      <div class="tally-strip">
        {#each REGISTER_STATUS as s (s)}
          <button
            class="tally {REGISTER_STATUS_CLASS[s]}"
            class:on={filters.status?.has(s)}
            disabled={tallies[s] === 0}
            title={tallies[s] === 0 ? 'None in this state' : `Show only: ${REGISTER_STATUS_LABEL[s]}`}
            on:click={() => toggleStatus(s)}
          >
            <span class="tally-n">{tallies[s]}</span>
            <span class="tally-l">{REGISTER_STATUS_LABEL[s]}</span>
          </button>
        {/each}
      </div>

      <FilterBar
        fields={filterFields}
        bind:values={filters}
        bind:query={search}
        searchPlaceholder="Name, reference, description…"
        resultLabel="{shown.length} of {REG.length}"
      />

      <!-- Export what is SHOWN. The spreadsheet carries every register field —
           a reader sorting and pivoting it is the whole point, and a column
           somebody else left out is one they cannot get back. -->
      <div class="export-row">
        <Button variant="secondary" size="small" disabled={!!exporting || shown.length === 0}
          on:click={() => runExport('xlsx')}>
          {exporting === 'xlsx' ? 'Building…' : `⬇ Excel (${shown.length})`}
        </Button>
        <Button variant="secondary" size="small" disabled={!!exporting || shown.length === 0}
          on:click={() => runExport('docx')}>
          {exporting === 'docx' ? 'Building…' : `⬇ Word (${shown.length})`}
        </Button>
        <span class="export-note">
          <strong>Excel</strong> carries every field — for working the list.
          <strong>Word</strong> is seven columns, laid out to read.
          {shown.length === REG.length
            ? 'Both cover the whole register.'
            : `Both cover the ${shown.length} shown, and record the filter.`}
        </span>
      </div>

      <!-- ⭐ THE SECTIONS ARE WHAT MAKE THIS ONE DOCUMENT RATHER THAN TWO.
           There used to be a separate "obligations statement" button beside
           these, and a red warning on every extract telling people not to
           confuse the two — a caution that existed only BECAUSE there were two.
           With no filter and every section on, the Word file IS the statement,
           and it says so itself. -->
      <div class="export-row sections-row">
        <span class="sections-label">Word also includes:</span>
        <label class="sec"><input type="checkbox" bind:checked={sections.caveats} />
          what the list does not claim</label>
        <label class="sec"><input type="checkbox" bind:checked={sections.absences} />
          reasoned absences</label>
        <label class="sec"><input type="checkbox" bind:checked={sections.actions} />
          outstanding actions</label>
      </div>

      <div class="export-row">
        <span class="export-note" class:is-statement={isStatement}>
          {#if isStatement}
            ⭐ <strong>With no filter and every section included, the Word file is
            this building’s obligations statement</strong> — the document you give
            a reviewer or the regulator. It titles and names itself accordingly.
          {:else}
            The Word file will call itself an <strong>extract</strong>, because
            {shown.length !== REG.length
              ? `it covers ${shown.length} of ${REG.length} requirements`
              : 'a section is left out'}. Clear the filter and tick every section
            to produce the full obligations statement.
          {/if}
          {#if $statutoryRegister.source !== 'database'}
            <strong class="warn">⛔ Reading the standard register that ships, not
            this building’s own. The file will say so.</strong>
          {/if}
        </span>
      </div>

      <!-- Bulk apply acts on WHAT IS SHOWN, not on every gap in the register.
           With filters that is the more useful of the two and the safer one:
           you can see exactly what you are about to create. -->
      {#if shownAddable.length > 0}
        <div class="bulk">
          <ProtectedButton requireAdmin={true} variant="primary" size="small"
            disabled={busy}
            on:click={() => apply(shownAddable.map(r => r.entry.key))}>
            Add {shownAddable.length} shown
          </ProtectedButton>
          <!-- ⚠ Says "switched off" BEFORE the click, not only in the report
               after it. The two facts a person needs in order to decide whether
               to press this are that nothing goes live, and that most of these
               will still need scoping by hand — 11 entries propose a scope, the
               rest match every component. -->
          <span class="bulk-note">
            Each is created switched off. Where the register proposes a scope it is
            applied; the rest match every component until you scope them.
          </span>
        </div>
      {/if}

      {#if shown.length === 0}
        <p class="all-clear">Nothing matches these filters.</p>
      {/if}

      {#each groups as section (section.group)}
        {@const collapsed = collapsedGroups.has(section.group)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="sec-head toggle" on:click={() => toggleGroup(section.group)}>
          <h4>
            <span class="chev sm" class:open={!collapsed}>▸</span>
            {section.label}
            <span class="sec-n">{section.rows.length} of {groupTotals[section.group] ?? section.rows.length}</span>
          </h4>
        </div>

        {#if !collapsed}
          <div class="rows tight">
            {#each section.rows as { entry, status } (entry.key)}
              {@const meta = rowMeta.get(entry.key) ?? {}}
              {@const open = expanded.has(entry.key)}
              {@const decision = decisions.get(entry.key)}
              <div class="row {REGISTER_STATUS_CLASS[status]}" class:expanded={open}>
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="row-head" on:click={() => toggleRow(entry.key)}>
                  <span class="chev sm" class:open>▸</span>
                  <div class="row-main">
                    <div class="row-title">
                      <span class="nm">{entry.name}</span>
                      <span class="badge {entry.basis}">{BASIS_LABEL[entry.basis]}</span>
                      {#if meta.inactiveOnly}
                        <span class="badge off" title="An obligation exists for this but is switched off">Switched off</span>
                      {/if}
                      {#if meta.activeCount > 1}
                        <span class="badge n">{meta.activeCount} obligations</span>
                      {/if}
                      {#if status === 'elsewhere'}
                        <span class="badge app">{HANDLED_BY_LABEL[entry.handledBy]}</span>
                      {/if}
                      {#if provenanceOf(entry.key).origin === 'local'}
                        <span class="badge local"
                          title="Added in this building, not from the standard register">Added here</span>
                      {/if}
                      {#if provenanceOf(entry.key).seedModifiedAt}
                        <span class="badge modified"
                          title="Edited here — no longer matches the standard register">Edited</span>
                      {/if}
                      {#if entry.operationallyIncomplete}
                        <span class="badge incomplete"
                          title="A frequent inspection beside an open defect reads as control it does not provide">⛔ Operationally incomplete</span>
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
                        <span class="applies-k">Proposed scope:</span>
                        {scopeSummary(entry.suggestedScope)}
                        <span class="scope-ok">verified against this building’s component types</span>
                      </p>
                    {:else if entry.scopeNote}
                      <p class="applies">
                        <span class="applies-k">Scoping:</span> {entry.scopeNote}
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
                        Already has its own cycle in {HANDLED_BY_LABEL[entry.handledBy]}. Adding an
                        obligation would put a second, competing due date on the same thing.
                      </p>
                    {/if}

                    {#if status === 'not_applicable'}
                      {#if decision}
                        <p class="decision">“{decision.reason}”</p>
                        <p class="decision-by">
                          Decided {fmtDate(decision.decided_at)}{#if personName.get(decision.decided_by)} by {personName.get(decision.decided_by)}{/if}
                        </p>
                      {:else}
                        <p class="decision-by">No decision record found for this exclusion.</p>
                      {/if}
                    {/if}

                    {#if status === 'not_covered'}
                      {@const candidates = suggestions.get(entry.key) ?? []}
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
                    {/if}

                    <div class="row-actions">
                      {#if status === 'not_covered'}
                        <ProtectedButton requireAdmin={true} variant="primary" size="small"
                          disabled={busy} on:click={() => apply([entry.key])}>Add</ProtectedButton>
                        <Button variant="secondary" size="small"
                          disabled={busy} on:click={() => askDecision(entry, 'not_applicable')}>Not applicable</Button>
                      {:else if status === 'not_applicable'}
                        <Button variant="secondary" size="small" disabled={busy}
                          on:click={() => askDecision(entry, 'applicable')}>Reinstate</Button>
                      {/if}
                      {#if canEditRegister}
                        <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                          on:click={() => editRequirement(entry)}>Edit requirement</ProtectedButton>
                      {/if}
                      {#if canEditRegister && provenanceOf(entry.key).origin === 'local'}
                        <ProtectedButton requireAdmin={true} variant="danger" size="small"
                          title="Only for a requirement added here by mistake"
                          on:click={() => askWithdraw(entry)}>Withdraw</ProtectedButton>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/each}
      {/if}
    </div>
  {/if}
</div>

<!-- ⛔ A delete in a compliance register. The modal's job is to stop it being
     used for the thing it looks like it is for. -->
<Modal show={!!withdrawing} title="Withdraw a requirement added here" size="medium"
       on:close={() => (withdrawing = null)}>
  {#if withdrawing}
    <div class="wd-body">
      <p class="wd-name">{withdrawing.name}</p>
      <p class="text-muted">{withdrawing.statutoryRef}</p>

      <p class="wd-warn">
        This is for a requirement <strong>added here by mistake</strong> — a duplicate, a typo,
        something entered while learning the screen. It has no legal existence, so removing it
        removes nothing real.
        <br /><br />
        ⛔ <strong>It is NOT how you say a requirement does not apply.</strong> If the duty is
        real and this building simply does not have the thing — no lift, no gas, no EV charging
        — close this and record it as <em>Not applicable</em> instead. That keeps the requirement
        visible with a reason and a name against it, which is what a reviewer needs to see. A
        deleted row answers nothing.
        <br /><br />
        ⚠ It will refuse if any obligation or applicability decision links to this requirement.
        Removing it then would leave that evidence pointing at something nothing can describe.
      </p>

      <FormTextarea label="Why is it being removed?" bind:value={withdrawReason} rows={3} required
        placeholder="e.g. Entered twice while working through the tutorial"
        helpText="Required. The row itself goes into the audit log, and this is what explains it." />

      <div class="wd-actions">
        <Button variant="secondary" disabled={withdrawBusy}
          on:click={() => (withdrawing = null)}>Cancel</Button>
        <Button variant="danger" disabled={withdrawBusy || withdrawReason.trim().length < 8}
          on:click={confirmWithdraw}>{withdrawBusy ? 'Removing…' : 'Withdraw'}</Button>
      </div>
    </div>
  {/if}
</Modal>

{#if showEntryModal}
  <RegisterEntryModal
    entry={editing}
    provenance={editing ? provenanceOf(editing.key) : {}}
    saving={savingEntry}
    on:save={saveEntry}
    on:verify={verifyCitation}
    on:close={() => { showEntryModal = false; editing = null; }}
  />
{/if}

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
  /* ── Which kind you are looking at ─────────────────────────────────────── */
  /* Deliberately NOT styled like the tally strip below it, which is a filter
     over one list. This changes what the list IS, and the two must not look
     like the same control. */
  .kinds {
    display: flex; flex-wrap: wrap; gap: 0.3rem;
    border-bottom: 1px solid rgb(71 85 105 / 0.5);
  }
  .kind {
    display: flex; align-items: baseline; gap: 0.35rem; cursor: pointer;
    padding: 0.4rem 0.7rem; border-radius: 6px 6px 0 0; font-size: 0.76rem;
    border: 1px solid transparent; border-bottom: none;
    color: rgb(148 163 184); background: transparent; margin-bottom: -1px;
  }
  .kind:hover:not(:disabled) { color: rgb(226 232 240); background: rgb(30 41 59 / 0.5); }
  .kind:disabled { opacity: 0.4; cursor: default; }
  .kind.on {
    color: rgb(226 232 240); background: rgb(15 23 42 / 0.6);
    border-color: rgb(71 85 105 / 0.7); border-bottom: 1px solid rgb(15 23 42 / 0.6);
  }
  .kind-n { font-weight: 700; font-size: 0.85rem; color: rgb(226 232 240); }
  .kind.on .kind-n { color: var(--lh-accent); }
  .kind-blurb { font-size: 0.76rem; color: rgb(148 163 184); line-height: 1.45; }

  /* Shown only when a release and somebody here changed the same requirement. */
  .collision {
    font-size: 0.8rem; line-height: 1.5; color: rgb(253 230 138);
    background: rgb(69 26 3); border: 1px solid rgb(120 53 15);
    border-radius: 6px; padding: 0.65rem 0.8rem;
    display: flex; flex-direction: column; gap: 0.45rem; align-items: flex-start;
  }
  .collision-h { font-weight: 700; }

  /* ── The count strip: a summary that is also the control ───────────────── */
  .tally-strip { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .tally {
    display: flex; align-items: baseline; gap: 0.35rem; cursor: pointer;
    padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.72rem;
    border: 1px solid rgb(71 85 105 / 0.6); background: rgb(30 41 59 / 0.4);
    color: rgb(148 163 184); transition: border-color 0.12s, color 0.12s;
  }
  .tally:hover:not(:disabled) { border-color: rgb(148 163 184 / 0.8); color: rgb(226 232 240); }
  .tally:disabled { opacity: 0.4; cursor: default; }
  .tally.on { background: rgb(var(--lh-accent-rgb) / 0.15); border-color: rgb(var(--lh-accent-rgb) / 0.6); color: rgb(226 232 240); }
  .tally-n { font-weight: 700; font-size: 0.9rem; color: rgb(226 232 240); }
  .tally.gap .tally-n  { color: rgb(252 165 165); }
  .tally.ok .tally-n   { color: rgb(134 239 172); }
  .tally.else .tally-n { color: rgb(125 211 252); }

  .status.part { background: rgb(251 191 36 / 0.16); color: rgb(252 211 77); }
  .tally.part .tally-n { color: rgb(252 211 77); }
  .row.part { border-color: rgb(251 191 36 / 0.35); }
  .report-next { margin-top: 0.3rem; color: rgb(148 163 184); }
  .wd-body { display: flex; flex-direction: column; gap: 0.6rem; }
  .wd-name { font-weight: 600; color: rgb(226 232 240); }
  .wd-warn {
    font-size: 0.8rem; color: rgb(203 213 225); line-height: 1.5;
    background: rgb(248 113 113 / 0.1); border: 1px solid rgb(248 113 113 / 0.3);
    border-radius: 6px; padding: 0.6rem 0.7rem;
  }
  .wd-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
  .diff-wrap {
    border: 1px solid rgb(71 85 105 / 0.7); border-radius: 8px;
    background: rgb(15 23 42 / 0.5); padding: 0.75rem 0.85rem;
    display: flex; flex-direction: column; gap: 0.6rem;
  }
  .diff-close {
    align-self: flex-end; font-size: 0.75rem; color: rgb(148 163 184);
    background: none; border: none; cursor: pointer;
  }
  .diff-close:hover { color: rgb(226 232 240); }
  .export-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .export-note { font-size: 0.74rem; color: rgb(148 163 184); }
  .sections-row {
    margin-top: 0.35rem; padding-top: 0.6rem; border-top: 1px solid rgb(51 65 85);
    align-items: center; gap: 0.9rem;
  }
  .sections-label { font-size: 0.74rem; color: rgb(148 163 184); font-weight: 600; }
  .sec {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-size: 0.74rem; color: rgb(203 213 225); cursor: pointer;
  }
  .is-statement { color: rgb(190 242 100); }
  .export-note .warn { color: rgb(248 113 113); display: block; margin-top: 0.15rem; }
  .reg-actions { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .reg-actions-note { font-size: 0.74rem; color: rgb(148 163 184); }
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
  .bulk { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .bulk-note { font-size: 0.74rem; color: rgb(148 163 184); }
  .sec-n { font-weight: 400; color: rgb(100 116 139); font-size: 0.78rem; margin-left: 0.3rem; }

  /* ── Rows: compact, expanding in place ─────────────────────────────────── */
  .row-head { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; width: 100%; }
  .row-head .row-main { flex: 1; min-width: 0; }
  .row.expanded { border-color: rgb(var(--lh-accent-rgb) / 0.4); }
  .row-detail {
    margin-top: 0.55rem; padding-top: 0.55rem; padding-left: 1.1rem;
    border-top: 1px solid rgb(71 85 105 / 0.4);
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .row-detail .row-actions { margin-top: 0.4rem; display: flex; gap: 0.4rem; }
  .warn-text.late { color: rgb(248 113 113); font-weight: 600; }

  /* ⛔ NO `overflow: hidden` HERE — it clipped the filter dropdowns.
     It was only ever keeping `.tmpl-head:hover`'s tint inside the rounded
     corners, and it did that by clipping EVERY absolutely-positioned
     descendant to this box. The facet dropdowns hang below their buttons, so
     as soon as a filter narrowed the list the panel got shorter than the open
     dropdown and its bottom options were cut off — reported on the Trigger
     facet (ticking "Event" leaves 14 rows) but true of all seven.
     The corners are handled by rounding the head itself instead; nothing else
     in the body reaches an edge, because `.tmpl-body` insets everything by
     1rem. Do not put it back. */
  .tmpl { border: 1px solid rgb(71 85 105 / 0.5); border-radius: 10px; background: rgb(30 41 59 / 0.3); }
  .tmpl.has-gaps { border-color: rgb(251 191 36 / 0.4); }

  .tmpl-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; cursor: pointer;
               border-radius: 9px 9px 0 0; }
  /* Collapsed, the head IS the panel, so it takes all four corners. */
  .tmpl-head.closed { border-radius: 9px; }
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
