<!-- src/lib/apps/compliance/components/StatutoryTemplatePanel.svelte -->
<!-- M4 · the periodic activity register and its gap report, on Compliance >
     Compliance obligations. Every recurring check identified for a higher-risk residential
     building, each saying WHERE IT COMES FROM (legislation / standard /
     contract / our own decision) and HOW IT IS DEALT WITH HERE (which sub-app,
     or nothing).

     Coverage comes from statutory_obligations.template_key only — never from
     matching names. See src/lib/utils/statutoryTemplate.js. -->
<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import {
    templateCoverage, suggestMatches, basisTally,
    BASIS, BASIS_LABEL, BASIS_DESCRIPTION, isRecurring,
  } from '$lib/utils/statutoryTemplate.js';
  import {
    currentDecisions, isRecordableReason, reviewsDue, reviewState,
  } from '$lib/utils/statutoryExclusions.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { dueSoonDays } from '$lib/utils/dueWindows.js';
  import { profiles, profilesStore } from '$lib/stores/profiles.js';
  import { statutoryRegister } from '$lib/stores/statutoryRegister.js';
  import RegisterEntryModal from './RegisterEntryModal.svelte';
  import RegisterImportDiff from './RegisterImportDiff.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FilterBar from '$lib/components/common/FilterBar.svelte';
  import {
    filterRegister, registerStatusTally, groupRegisterRows, registerFilterFields,
    REGISTER_STATUS, REGISTER_STATUS_LABEL, REGISTER_STATUS_CLASS, REGISTER_STATUS_EXPLAINED,
    dutyHolderTally, citationState, groupRegisterRowsByRoute, routeGroupOf,
  } from '../utils/registerFilter.js';
  import { downloadRegisterXlsx, downloadRegisterDocx } from '../utils/registerDownloads.js';
  import { ofKind, kindTally, REGISTER_KINDS } from '$lib/utils/registerKinds.js';
  import { inAuthorOrder, KIND_SECTION } from '../utils/registerItemView.js';
  import RegisterItemsList from './RegisterItemsList.svelte';
  import RegisterRow from './RegisterRow.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';

  export let definitions = [];
  /** A register row another tab asked to see (the Display register's link).
   *  ⚠ A primitive, guarded below on `focusedFor` — an object here would
   *  re-run on every parent update (CLAUDE.md, safe_not_equal). */
  export let focusKey = null;

  const dispatch = createEventDispatcher();

  $: dismissedKeys = $inspectionDefinitionsStore.dismissedKeys ?? [];
  $: exclusions  = $inspectionDefinitionsStore.exclusions ?? [];
  $: decisions   = currentDecisions(exclusions);

  // An exclusion nobody revisits is how a register stays green while the
  // building changes underneath it — "no dwelling is let on a relevant tenancy"
  // is exactly the kind of statement that quietly stops being true. The review
  // date was already being recorded; until now nothing ever showed it back.
  $: dueReviews = reviewsDue(exclusions, { withinDays: dueSoonDays('exclusionReview') });
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

  // ⚠ NO LONGER COLLAPSIBLE, and the reason is V2 rather than taste. This panel
  // used to sit stacked ABOVE the planned obligations list on one tab, where
  // folding it away was how you reached the list. It is now the whole of its
  // own tab, so a collapse would hide the entire screen and reveal nothing —
  // an affordance whose only outcome is a blank page. The auto-open that
  // existed to force it back open when there were gaps went with it.
  let showLegend = false;
  // ⛔ A BULK ACTION ON EIGHTY RECORDS HAD NO CONFIRMATION, and the user found it
  // by refusing to press the button: *"a button says 'add 80 shown' — it's just
  // not something I could click."* That instinct was reading a real property of
  // the thing. One click created eighty obligations, and undoing it meant
  // deleting them one at a time.
  let confirmBulk = false;
  let showTools = false;
  let busy = false;
  let panelError = '';
  let applyReport = null;

  // -- Filtering ---------------------------------------------------------------
  // Status is a FILTER, not a view mode: "Gaps and coverage" and "Full register"
  // were two renderings of these same entries, and the gap list is simply
  // `status = not_covered`. It starts there because that is the work.
  let search = '';
  let filters = { status: new Set(['not_covered']) };
  // ⛔ THE DEFAULT MUST NOT OUTLIVE ITS REASON. *Not covered* is the work — until
  // there is none. Once every schedulable duty has been applied (true on this
  // building since 2026-09-21) the default filter showed an EMPTY list on
  // arrival, and its chip was disabled at 0, so a first-time user could not even
  // click it off: the screen read as broken. So the untouched default is dropped
  // the moment it would hide everything; a filter somebody chose is never
  // second-guessed.
  let statusIsDefault = true;
  $: if (statusIsDefault && $statutoryRegister.loaded && tallies.not_covered === 0
         && filters.status?.size === 1 && filters.status.has('not_covered')) {
    statusIsDefault = false;
    filters = { ...filters, status: new Set() };
  }
  let expanded = new Set();          // keys whose detail is showing

  // Arriving from another tab with a row in mind: show that row and only it.
  // The filters that could hide it are cleared, the kind switches to
  // requirements, and the search is set to its name so the reason the list is
  // short is visible in the bar rather than silent.
  let focusedFor = null;
  $: if (focusKey && focusKey !== focusedFor && REG?.length) {
    focusedFor = focusKey;
    focusOn(focusKey);
  }
  async function focusOn(key) {
    const entry = REG.find((e) => e.key === key);
    if (!entry) return;
    kind = 'requirement';
    statusIsDefault = false;
    filters = { status: new Set() };
    search = entry.name;
    expanded = new Set([...expanded, key]);
    await tick();
    document.getElementById(`reg-row-${key}`)?.scrollIntoView?.({ block: 'center' });
  }
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
    statusIsDefault = false;
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
  // ⭐ TWO WAYS TO CUT THE SAME LIST, and which one you want depends on the job.
  // By SUBJECT to work through the fire safety duties; by HOW IT IS DONE to see
  // the shape the user drew — in-house walks, contractor visits, tracked
  // elsewhere, and the ones nothing here can schedule.
  /** @type {'group'|'route'} */
  let groupBy = 'group';
  $: groups    = groupBy === 'route' ? groupRegisterRowsByRoute(shown) : groupRegisterRows(shown);

  // "N of M" per group heading needs the unfiltered total for that group.
  // ⚠ Keyed on whichever grouping is showing. Left on `e.group`, a route
  // heading would read "6 of 6" while the register holds 57 of them.
  $: groupTotals = REG.reduce((m, e) => {
    const k = groupBy === 'route' ? routeGroupOf(e) : e.group;
    m[k] = (m[k] ?? 0) + 1; return m;
  }, /** @type {Record<string, number>} */ ({}));

  // Only entries that can actually be created — bulk apply must never offer to
  // add something the scheduler cannot date, nor a SECOND copy of one that
  // apply already created and left switched off.
  // ⚠ "Narrowed" means a set somebody CHOSE, so the status filter does not count:
  // it defaults to *Not covered*, which is simply the work that is left rather
  // than a decision about which part of it to do next.
  $: narrowed = search.trim().length > 0
    || Object.entries(filters).some(([k, v]) => k !== 'status' && v?.size > 0);

  // ⚠ Below this, pressing the button just does it — a set of six you filtered
  // to on purpose does not need defending against. Above it, the confirmation
  // earns its interruption.
  const CONFIRM_OVER = 10;

  $: shownAddable = shown.filter(r => r.status === 'not_covered');

  // Per-row extras the coverage report knows and the register entry does not.
  $: rowMeta = new Map(/** @type {[string, {inactiveOnly?: boolean, activeCount?: number}][]} */ ([
    ...coverage.missing.map(m => [m.entry.key, { inactiveOnly: m.inactiveOnly }]),
    ...coverage.covered.map(c => [c.entry.key, { activeCount: c.activeCount }]),
  ]));
</script>

<div class="tmpl" class:has-gaps={coverage.missing.length > 0}>
  <div class="tmpl-head">
    <div class="th-left">
      <div>
        <!-- ⚠ Was "Periodic activity register", which had gone wrong twice over:
             ISO 37301 calls this a compliance obligations register, and since the
             four kinds landed it holds actions, absences and caveats as well as
             periodic activities. -->
        <p class="th-title">Compliance obligations register</p>
        <p class="th-sub">
          {REG.length} compliance obligations identified
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
        Everything a higher-risk residential building in England has to check regularly — from law,
        British Standards, contracts and our own decisions. <strong>Mark anything this building does
        not have as <em>not applicable</em></strong>, with a reason, and it stops counting against you.
        ⚠ The intervals here are the usual ones; your own risk assessment may need them more often.
      </p>

      <!-- Where these come from — the legend that makes the badges mean something -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="legend-head" on:click={() => (showLegend = !showLegend)}>
        <span class="chev sm" class:open={showLegend}>▸</span>
        <span>Where these compliance obligations come from</span>
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
            Each entry also says whether its interval comes from that source, or is simply what is
            normally done where the wording is vague.
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
            {collisions.length} compliance obligation{collisions.length === 1 ? '' : 's'} changed in
            the application, and {collisions.length === 1 ? 'was' : 'were'} also edited here
          </p>
          <p>
            Nothing has been overwritten. Open each one and pick the wording that is right
            for this building.
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
              ✓ Added {applyReport.created.length}. <strong>Nothing is live yet</strong> — no walk and no
              contractor job is created until you turn each one on.
            </p>
            <!-- ⭐ THE HANDOVER BETWEEN THE TWO TABS. Stacked on one screen this
                 said "find them below"; V2 put the list on its own tab, so the
                 only thing carrying the register → plan sequence is this. ⛔ It
                 is a button rather than an automatic jump: the apply can fail
                 per row, and whisking somebody past `applyReport.failed` to a
                 screen that cannot show it would be the "reads plausibly while
                 saying something untrue" fault with navigation. -->
            <p class="report-next">
              They are on <strong>Planned obligations</strong>, marked <em>Added — not switched on</em>.
              Most still need you to choose what they cover — filter
              <strong>What it covers</strong> to <strong>Not chosen</strong> and work through them.
            </p>
            <Button variant="primary" size="small" on:click={() => dispatch('goto', 'planned')}>
              Set them up →
            </Button>
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
            disabled={tallies[s] === 0 && !filters.status?.has(s)}
            title={tallies[s] === 0 ? 'None of these' : `${REGISTER_STATUS_EXPLAINED[s]} — click to show only these`}
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

      <div class="groupby">
        <span class="groupby-l">Group by</span>
        <button class="gb" class:on={groupBy === 'group'}
          on:click={() => (groupBy = 'group')}>Subject</button>
        <button class="gb" class:on={groupBy === 'route'}
          on:click={() => (groupBy = 'route')}>How it gets done</button>
      </div>

      <!-- ⭐ FOLDED AWAY, AND THE REASON IS THE WHOLE POINT OF THIS PANEL.
           The user: *"still very complicated for a user. I come to the first
           screen and see things like..."* — and counting what stood between the
           kind tabs and the first row of the list gave NINE separate bands of
           controls and explanation. Four of them were about producing a
           document, which is something you do at the END, and one was a button
           for adding a duty by hand, which is rare.

           ⛔ Copy-editing those bands would not have fixed it. They were mostly
           well written; there were simply too many of them in front of somebody
           who came to read a list. **A band that is collapsed costs one line;
           the same band open costs the reader's place in the page.**

           ⚠ Nothing is removed and nothing moved behind a menu — it opens with
           one click and the summary says what is inside. -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="tools-head" on:click={() => (showTools = !showTools)}>
        <span class="chev sm" class:open={showTools}>▸</span>
        <span>Download this list, or add a compliance obligation</span>
        <span class="tools-hint">
          {isStatement ? 'Word gives you the full obligations statement' : 'Excel · Word'}
        </span>
      </div>

      {#if showTools}
        <div class="tools">
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
            <strong>Excel</strong> has every column, for working through.
            <strong>Word</strong> is laid out to read.
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
              <strong>This Word file will be your obligations statement</strong> — the
              document you give a reviewer or the regulator. It arrives named
              <em>Obligations_Statement</em>.
            {:else}
              This Word file will be an <strong>extract</strong>, not the full statement,
              because {shown.length !== REG.length
                ? `it covers only ${shown.length} of the ${REG.length}`
                : 'a section is unticked'}. Clear the filters and tick all three boxes to
              get the statement.
            {/if}
            {#if $statutoryRegister.source !== 'database'}
              <strong class="warn">⚠ This building’s own list could not be read, so this
              is the standard one. The file will say so on its first page — do not send it.</strong>
            {/if}
          </span>
        </div>

          {#if canEditRegister}
            <div class="export-row">
              <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                on:click={addRequirement}>+ Add a compliance obligation</ProtectedButton>
              <span class="export-note">
                For a duty this building has that is not already in the list.
              </span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Bulk apply acts on WHAT IS SHOWN, not on every gap in the register.
           With filters that is the more useful of the two and the safer one:
           you can see exactly what you are about to create. -->
      <!-- ⭐ NOBODY WANTS TO ADD EIGHTY. The user, and it is the best correction
           this screen has had: *"why would you want to add 80? I think the user
           wants to slowly go over this list for days, slowly adding in sets of
           regs."* That is obviously how it is done — a morning on the fire door
           duties, another on water hygiene — and the screen was built around
           adopting the lot in one press.

           ⛔ RENAMING THE BUTTON DID NOT FIX THAT, which is why this is a second
           attempt. A confident primary button offering all eighty invites the
           one thing nobody does, and makes the considered version — filter to
           six, add those six — look like the unusual path.

           So the button follows the list: quiet while the set is just "everything
           left", confident once you have chosen a set. Same action either way;
           what changes is which one looks like the thing to do. -->
      {#if shownAddable.length > 0}
        <div class="bulk">
          <ProtectedButton requireAdmin={true} size="small" disabled={busy}
            variant={narrowed ? 'primary' : 'secondary'}
            on:click={() => (shownAddable.length > CONFIRM_OVER
              ? (confirmBulk = true)
              : apply(shownAddable.map(r => r.entry.key)))}>
            Add {narrowed ? `these ${shownAddable.length}` : `all ${shownAddable.length}`} as planned obligations
          </ProtectedButton>
          <span class="bulk-note">
            <!-- ⛔ THIS SENTENCE IS SHARED, AND IT USED TO BE IN THE NARROWED
                 BRANCH ONLY. Adding entries creates them SWITCHED OFF
                 (`templateToObligation` sets `active: false`, pinned by a test
                 over every entry) — which is the single fact that makes "Add
                 all 80" a reasonable thing to press rather than an alarming
                 one. It was shown only once you had already narrowed to a
                 handful, i.e. in exactly the case that needed it least, while
                 the button offering eighty sat next to advice about working in
                 sets and never mentioned that nothing would start. -->
            <strong>Nothing goes live until you turn each one on</strong>, and most
            will then need you to say which parts of the building they cover.
            {#if !narrowed}
              <br />
              ⭐ <strong>Most people still work through this over days, a set at a time.</strong>
              Narrow the list first — by <strong>Group</strong>, or by who the
              <strong>Duty holder</strong> is — and add that set. The
              <em>Not covered</em> count above is your place in the queue; it comes
              down as you go.
              ⚠ There is no bulk remove, so a set added by mistake comes back out
              one at a time.
            {/if}
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
          {#if section.blurb && !collapsed}<p class="sec-blurb">{section.blurb}</p>{/if}
        </div>

        {#if !collapsed}
          <div class="rows tight">
            {#each section.rows as { entry, status } (entry.key)}
              {@const meta = rowMeta.get(entry.key) ?? {}}
              {@const open = expanded.has(entry.key)}
              {@const decision = decisions.get(entry.key)}
              <RegisterRow {entry} {status} {meta} {open} {decision} {filters} {busy} {canEditRegister}
                provenance={provenanceOf(entry.key)}
                candidates={suggestions.get(entry.key) ?? []}
                decidedByName={decision ? personName.get(decision.decided_by) ?? null : null}
                on:toggle={(e) => toggleRow(e.detail)}
                on:showDisplayRegister
                on:link={(e) => link(e.detail.obligationId, e.detail.key)}
                on:apply={(e) => apply(e.detail)}
                on:decide={(e) => askDecision(e.detail.entry, e.detail.kind)}
                on:edit={(e) => editRequirement(e.detail)}
                on:withdraw={(e) => askWithdraw(e.detail)} />
            {/each}
          </div>
        {/if}
      {/each}
      {/if}
    </div>
</div>

<!-- ⛔ EIGHTY RECORDS IN ONE CLICK. The three things a person needs before
     pressing it: what appears, what does NOT happen, and how hard it is to
     reverse. The last one is the honest reason this dialog exists — there is no
     bulk remove, so getting it wrong costs eighty visits to a modal. -->
<ConfirmDialog
  show={confirmBulk}
  title="Add {shownAddable.length} planned obligations to this building?"
  message={`${shownAddable.length} planned obligations will be created for this building. None of them goes `
    + `live: nothing reaches the mobile app or the job scheduler until you turn each one on, and `
    + `most will then need you to say which parts of the building they cover. `
    + `If you change your mind afterwards, they have to be removed one at a time.`}
  confirmText="Add them"
  processing={busy}
  on:confirm={() => { confirmBulk = false; apply(shownAddable.map(r => r.entry.key)); }}
  on:cancel={() => (confirmBulk = false)}
/>

<!-- ⛔ A delete in a compliance register. The modal's job is to stop it being
     used for the thing it looks like it is for. -->
<Modal show={!!withdrawing} title="Withdraw a compliance obligation added here" size="medium"
       on:close={() => (withdrawing = null)}>
  {#if withdrawing}
    <div class="wd-body">
      <p class="wd-name">{withdrawing.name}</p>
      <p class="text-muted">{withdrawing.statutoryRef}</p>

      <p class="wd-warn">
        Use this only for something <strong>added here by mistake</strong> — a duplicate, a typo,
        an entry made while learning the screen.
        <br /><br />
        ⛔ <strong>It is NOT how you say a compliance obligation does not apply.</strong> If the duty
        is real and this building simply does not have the thing — no lift, no gas, no EV charging —
        close this and record it as <em>Not applicable</em> instead. That leaves the compliance
        obligation on the list with your reason and your name beside it, which is what a reviewer
        needs to see. Deleting it answers nobody.
        <br /><br />
        ⚠ It will refuse if any work or decision is linked to this compliance obligation, because that
        evidence would be left pointing at nothing.
      </p>

      <FormTextarea label="Why is it being removed?" bind:value={withdrawReason} rows={3} required
        placeholder="e.g. Entered twice while working through the tutorial"
        helpText="Required. The whole entry is kept in the audit log, and this is what explains why it went." />

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
            It will stop counting as a gap. If the building does have one, add a planned obligation
            instead — a duty that is genuinely required and has nothing planned against it is what
            this report exists to find.
          </p>
        {/if}
      {:else}
        <p class="na-warn">
          This reinstates the compliance obligation. The earlier decision stays in the record; this is recorded beside it,
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
        helpText="Required. This is a record somebody may have to defend — write what would answer the question in three years." />

      {#if decisionKind === 'not_applicable'}
        <FormInput
          label="Review this decision on (optional)"
          type="date"
          bind:value={decisionReviewDue}
          helpText="Set one where the answer could change without anyone telling you. “No lift” will keep; “nothing is let on that kind of tenancy” will not." />
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
  .tally.part .tally-n { color: rgb(252 211 77); }
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
  /* One collapsed line in place of four bands of document controls. */
  .tools-head {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
    cursor: pointer; font-size: 0.78rem; color: rgb(148 163 184);
  }
  .tools-hint { color: rgb(100 116 139); font-size: 0.74rem; margin-left: auto; }
  .tools {
    display: flex; flex-direction: column; gap: 0.6rem;
    padding: 0.65rem 0.8rem; border-radius: 8px;
    background: rgb(15 23 42 / 0.5); border: 1px solid rgb(71 85 105 / 0.4);
  }
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
  .bulk { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .bulk-note { font-size: 0.74rem; color: rgb(148 163 184); }
  .groupby { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .groupby-l { font-size: 0.72rem; color: rgb(100 116 139); text-transform: uppercase; letter-spacing: 0.04em; }
  .gb {
    font-size: 0.74rem; padding: 0.2rem 0.55rem; border-radius: 6px; cursor: pointer;
    border: 1px solid rgb(71 85 105 / 0.6); background: rgb(30 41 59 / 0.4); color: rgb(148 163 184);
  }
  .gb.on { color: rgb(226 232 240); border-color: var(--lh-accent); background: rgb(var(--lh-accent-rgb) / 0.12); }
  .sec-blurb { font-size: 0.74rem; color: rgb(100 116 139); line-height: 1.45; margin: 0.1rem 0 0.2rem 1.1rem; }
  .sec-n { font-weight: 400; color: rgb(100 116 139); font-size: 0.78rem; margin-left: 0.3rem; }
  .warn-text.late { color: rgb(248 113 113); font-weight: 600; }

  /* ⛔ NO `overflow: hidden` HERE — it clipped the filter dropdowns.
     It was only ever keeping the head's hover tint inside the rounded corners
     (a hover that has since gone with the collapse), and it did that by
     clipping EVERY absolutely-positioned
     descendant to this box. The facet dropdowns hang below their buttons, so
     as soon as a filter narrowed the list the panel got shorter than the open
     dropdown and its bottom options were cut off — reported on the Trigger
     facet (ticking "Event" leaves 14 rows) but true of all seven.
     The corners are handled by rounding the head itself instead; nothing else
     in the body reaches an edge, because `.tmpl-body` insets everything by
     1rem. Do not put it back. */
  .tmpl { border: 1px solid rgb(71 85 105 / 0.5); border-radius: 10px; background: rgb(30 41 59 / 0.3); }
  .tmpl.has-gaps { border-color: rgb(251 191 36 / 0.4); }

  /* ⚠ Not a button any more — see the note on `open` in the script. No
     `cursor: pointer` and no hover tint, because nothing here is clickable. */
  .tmpl-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem;
               border-radius: 9px 9px 0 0; }
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

  .legend-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; cursor: pointer; font-size: 0.78rem; color: rgb(148 163 184); }
  .legend-counts { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-left: auto; }
  .legend { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.65rem 0.8rem; border-radius: 8px; background: rgb(15 23 42 / 0.5); border: 1px solid rgb(71 85 105 / 0.4); }
  .legend-row { display: grid; grid-template-columns: 150px 1fr; gap: 0.6rem; align-items: start; }
  .legend-row p { font-size: 0.76rem; color: rgb(148 163 184); line-height: 1.45; }
  .legend-note { font-size: 0.74rem; color: rgb(100 116 139); border-top: 1px solid rgb(71 85 105 / 0.4); padding-top: 0.45rem; }

  .report { font-size: 0.82rem; color: rgb(134 239 172); background: rgb(34 197 94 / 0.1); border-radius: 6px; padding: 0.6rem 0.75rem; }
  .report.bad { color: rgb(203 213 225); background: rgb(251 191 36 / 0.1); }
  .report .fail { color: rgb(252 165 165); }

  .sec-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.25rem; }
  .sec-head.toggle { cursor: pointer; }
  .sec-head h4 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(148 163 184); font-weight: 600; }

  .rows { display: flex; flex-direction: column; gap: 0.5rem; }
  .rows.tight { gap: 0.25rem; }

  .badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; white-space: nowrap; }
  .badge.statute    { background: rgb(248 113 113 / 0.18); color: rgb(252 165 165); }
  .badge.standard   { background: rgb(56 189 248 / 0.16);  color: rgb(125 211 252); }
  .badge.contract   { background: rgb(167 139 250 / 0.18); color: rgb(196 181 253); }
  .badge.management { background: rgb(148 163 184 / 0.2);  color: rgb(203 213 225); }
  .dot  { color: rgb(100 116 139); }
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
</style>
