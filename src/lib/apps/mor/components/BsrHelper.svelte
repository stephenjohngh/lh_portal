<!-- src/lib/apps/mor/components/BsrHelper.svelte -->
<!-- Handles both BSR notice and BSR report recording.
     mode = 'notice' | 'report'
     Generates pre-filled content from the case for copy-paste into the BSR portal. -->
<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { bsrReportClock } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDateTime, fmtDate } from '$lib/utils/dates';

  export let show   = false;
  export let saving = false;
  export let error  = '';
  export let mode   = 'notice';  // 'notice' | 'report'
  export let c      = null;      // mor_cases row

  const dispatch = createEventDispatcher();

  let ref         = '';
  let submittedAt = '';
  let notes       = '';

  let refError = '';

  $: isNotice = mode === 'notice';
  $: title = isNotice ? 'Record BSR Notice Submission' : 'Record BSR Full Report Submission';
  $: bsrClock = (mode === 'report' && c)
    ? bsrReportClock(c.identification_date)
    : null;

  // Reset and pre-fill every time the modal opens (so closing via the
  // X button does not leak stale state into the next open).
  let prevShow = false;
  $: if (show && !prevShow) {
    ref         = '';
    notes       = '';
    refError    = '';
    submittedAt = new Date().toISOString().slice(0, 16);
  }
  $: prevShow = show;

  // ── Pre-filled content ────────────────────────────────────────────────────

  $: noticeContent = c ? `
SUBMITTER: [Your name, role, organisation]
BUILDING:  [Building name and full address]
HRB REF:   [BSR HRB registration number]
IDENTIFIED: ${fmtDateTime(c.identification_date)}

DESCRIPTION:
${c.description}

LOCATION: ${c.location_text || '[location within building]'}

IMMEDIATE ACTIONS TAKEN:
[List interim mitigation measures already in place]

INTERNAL CASE REF: ${c.reference}
`.trim() : '';

  $: reportContent = c ? `
BSR NOTICE REF: ${c.bsr_notice_ref || '[notice reference from BSR portal]'}
BUILDING REG:   [HRB registration number]
SUBMITTER:      [Name, role, organisation]

THE OCCURRENCE OR RISK:
${c.description}

LOCATION: ${c.location_text || '[location within building]'}
DATE IDENTIFIED: ${fmtDate(c.identification_date)}

WHAT HAPPENED OR COULD HAPPEN:
[Mechanism analysis: how the occurrence could lead to death or serious injury,
and to how many people. Include worst-case if not remedied.]

WHO IS AFFECTED:
[Residents (number and any vulnerable groups), staff, visitors.]

ACTIONS TAKEN:
[Interim mitigation measures; resident communications; specialist engagement.]

ACTIONS PLANNED:
[Remediation plan with milestones and target dates.]

INTERNAL CASE REF: ${c.reference}
`.trim() : '';

  $: content = isNotice ? noticeContent : reportContent;

  // ── Validation / submit ───────────────────────────────────────────────────

  function reset() {
    ref = ''; submittedAt = new Date().toISOString().slice(0, 16);
    notes = ''; refError = '';
  }

  function validate() {
    refError = '';
    if (!ref.trim()) {
      refError = `${isNotice ? 'Notice' : 'Report'} reference from the BSR portal is required.`;
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', {
      ...(isNotice
        ? { noticeRef: ref.trim(), submittedAt: new Date(submittedAt).toISOString(), notes }
        : { reportRef: ref.trim(), submittedAt: new Date(submittedAt).toISOString(), notes }
      ),
    });
  }

  function handleClose() {
    reset();
    dispatch('close');
  }

  let copied = false;
  let copyTimer = null;
  async function copyContent() {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copied = false; copyTimer = null; }, 2000);
    } catch { /* ignore */ }
  }
  onDestroy(() => { if (copyTimer) clearTimeout(copyTimer); });
</script>

<Modal {show} {title} size="xlarge" on:close={handleClose}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <!-- 10-day clock warning for report mode -->
    {#if mode === 'report' && bsrClock}
      <div class="rounded-lg border p-3
                  {bsrClock.status === 'breach'   ? 'border-red-700 bg-red-900/40' :
                   bsrClock.status === 'critical' ? 'border-red-600 bg-red-900/30' :
                   bsrClock.status === 'warning'  ? 'border-amber-600 bg-amber-900/30' :
                   'border-slate-600 bg-slate-800/40'}">
        <p class="text-sm font-semibold
                  {bsrClock.status === 'breach'   ? 'text-red-300' :
                   bsrClock.status === 'critical' ? 'text-red-300' :
                   bsrClock.status === 'warning'  ? 'text-amber-300' :
                   'text-slate-300'}">
          {bsrClock.status === 'breach'
            ? '🚨 Statutory 10-day deadline BREACHED'
            : `⏱ Statutory 10-day deadline: ${bsrClock.label}`}
        </p>
        <p class="text-xs text-slate-400 mt-0.5">
          Identified: {fmtDateTime(c.identification_date)} · Deadline: {fmtDateTime(bsrClock.deadline.toISOString())}
        </p>
      </div>
    {/if}

    <div class="grid grid-cols-2 gap-4">

      <!-- Left: Pre-filled content -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <p class="text-sm font-medium text-slate-300">
            {isNotice ? 'Notice content' : 'Report content'}
            <span class="text-xs text-slate-500 font-normal ml-1">— copy and paste into the BSR portal</span>
          </p>
          <button
            type="button"
            on:click={copyContent}
            class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <pre class="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300
                    overflow-auto max-h-80 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
      </div>

      <!-- Right: Record submission -->
      <div class="space-y-3">
        <p class="text-sm font-medium text-slate-300">
          After submitting to the BSR portal, record the details below:
        </p>

        <div>
          <label for="bsr-ref" class="block text-xs font-medium text-slate-400 mb-1">
            {isNotice ? 'BSR notice reference' : 'BSR report reference'}
            <span class="text-red-400">*</span>
          </label>
          <input
            id="bsr-ref"
            type="text"
            bind:value={ref}
            placeholder="Reference returned by the BSR portal"
            class="w-full bg-slate-700 border {refError ? 'border-red-500' : 'border-slate-600'}
                   rounded px-3 py-2 text-sm text-white placeholder-slate-500
                   focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {#if refError}<p class="text-red-400 text-xs mt-1">{refError}</p>{/if}
        </div>

        <div>
          <label for="bsr-submitted-at" class="block text-xs font-medium text-slate-400 mb-1">
            Submitted to BSR portal at
          </label>
          <input
            id="bsr-submitted-at"
            type="datetime-local"
            bind:value={submittedAt}
            class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
                   focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label for="bsr-notes" class="block text-xs font-medium text-slate-400 mb-1">Notes</label>
          <textarea
            id="bsr-notes"
            bind:value={notes}
            rows="3"
            placeholder="Any relevant notes about the submission…"
            class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
                   placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          ></textarea>
        </div>

        <div class="bg-slate-800/60 border border-slate-700 rounded p-3 text-xs text-slate-400">
          <strong class="text-slate-300">BSR portal:</strong> Submit via
          <a href="https://www.gov.uk/guidance/submit-a-mandatory-occurrence-notice-or-report"
             target="_blank" rel="noopener noreferrer"
             class="text-purple-400 underline">gov.uk</a>
          or by phone on 0300 790 6787.
        </div>
      </div>
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={handleClose}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : `Record ${isNotice ? 'Notice' : 'Report'} Submission`}
    </Button>
  </svelte:fragment>
</Modal>
