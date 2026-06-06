<!-- src/lib/apps/mor/components/ReporterContactPanel.svelte -->
<!-- Phase 2c — Renders any active reporter-contact nudges for a case.
     Three nudges are possible:
       1. BSR-track escalation (case is on the BSR path, reporter not yet notified)
       2. Closure (case is closed, reporter / residents not yet notified)
       3. Staleness (> 14 days since reporter heard from us)
     Each nudge offers a "Draft letter" download and a "Record contact" /
     "Skip with reason" pair that writes a `reporter_contact` timeline entry
     via the store. -->
<script>
  import { supabase } from '$lib/supabaseClient';
  import { morStore } from '$lib/apps/mor/stores/morStore';
  import Button       from '$lib/components/common/Button.svelte';
  import RecordContactForm from '$lib/apps/mor/components/RecordContactForm.svelte';
  import {
    shouldShowBsrNotifyNudge,
    shouldShowClosureNudge,
    shouldShowStalenessNudge,
  } from '$lib/apps/mor/utils/morHelpers';

  export let c;
  export let timeline = [];

  $: bsrNotify = shouldShowBsrNotifyNudge(c, timeline);
  $: closure   = shouldShowClosureNudge(c, timeline);
  $: stale     = shouldShowStalenessNudge(c, timeline);

  // ── Modal state ──────────────────────────────────────────────────────────
  let showForm   = false;
  let formKind   = 'other';
  let formTitle  = 'Record contact';
  let formSubtitle = '';

  // Downloading state per template
  let downloading = null;
  let downloadError = '';

  function openForm(kind, title, subtitle = '') {
    formKind     = kind;
    formTitle    = title;
    formSubtitle = subtitle;
    showForm     = true;
  }

  async function handleSubmit({ detail }) {
    const r = await morStore.recordReporterContact(c.id, detail);
    if (r.success) {
      showForm = false;
    }
  }

  async function downloadLetter(template, label) {
    downloading = template;
    downloadError = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        downloadError = 'Not signed in. Please refresh and try again.';
        return;
      }

      const r = await fetch(`/api/mor/${encodeURIComponent(c.id)}/draft-letter`, {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ template }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        downloadError = j.error ?? `Could not generate ${label}.`;
        return;
      }
      const blob = await r.blob();
      const dispo = r.headers.get('Content-Disposition') ?? '';
      const m = dispo.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `${c.reference}-${template}.docx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      downloadError = `Could not generate ${label}: ${err.message}`;
    } finally {
      downloading = null;
    }
  }
</script>

{#if (bsrNotify || closure.reporter || closure.residents || stale)}

  {#if downloadError}
    <div class="mb-3 rounded-lg border border-red-700 bg-red-900/40 p-3 text-sm text-red-200">
      {downloadError}
    </div>
  {/if}

  <!-- ── Nudge 1: BSR escalation notification ───────────────────────────── -->
  {#if bsrNotify}
    <div class="mb-3 rounded-lg border border-amber-700/60 bg-amber-900/30 p-4">
      <p class="text-sm font-semibold text-amber-200 mb-1">
        ⏵ Write to the reporter about the BSR escalation
      </p>
      <p class="text-sm text-amber-100/80 mb-3">
        The Building Safety Regulator has been notified. You should write to the reporter
        confirming the case has been reported and giving the BSR notice reference.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" size="small"
                disabled={downloading === 'reporter_bsr'}
                on:click={() => downloadLetter('reporter_bsr', 'BSR notification letter')}>
          {downloading === 'reporter_bsr' ? 'Generating…' : '📄 Draft letter'}
        </Button>
        <Button variant="primary" size="small"
                on:click={() => openForm('bsr_notified',
                  'Record reporter contact',
                  'Reporter notified of BSR escalation')}>
          ✓ Record contact
        </Button>
        <Button variant="ghost" size="small"
                on:click={() => openForm('bsr_notified_skipped',
                  'Skip this step',
                  'Why are you not writing to the reporter at this stage?')}>
          Skip with reason
        </Button>
      </div>
    </div>
  {/if}

  <!-- ── Nudge 2: Closure ───────────────────────────────────────────────── -->
  {#if closure.reporter || closure.residents}
    <div class="mb-3 rounded-lg border border-emerald-700/60 bg-emerald-900/30 p-4">
      <p class="text-sm font-semibold text-emerald-200 mb-1">
        ⏵ Write closure letters
      </p>
      <p class="text-sm text-emerald-100/80 mb-3">
        The case is closed.
        {#if closure.reporter}Write to the reporter with the outcome.{/if}
        {#if closure.residents}{closure.reporter ? ' ' : ''}Also consider a notice to the wider block (anonymised).{/if}
      </p>
      <div class="flex flex-wrap gap-2">
        {#if closure.reporter}
          <Button variant="secondary" size="small"
                  disabled={downloading === 'reporter_closure'}
                  on:click={() => downloadLetter('reporter_closure', 'reporter closure letter')}>
            {downloading === 'reporter_closure' ? 'Generating…' : '📄 Reporter letter'}
          </Button>
          <Button variant="primary" size="small"
                  on:click={() => openForm('closure_reporter',
                    'Record reporter contact',
                    'Closure letter sent to reporter')}>
            ✓ Record reporter contact
          </Button>
          <Button variant="ghost" size="small"
                  on:click={() => openForm('closure_reporter_skipped',
                    'Skip writing to the reporter',
                    'Why are you not writing to the reporter at closure?')}>
            Skip
          </Button>
        {/if}
        {#if closure.residents}
          <span class="flex-basis-full w-full"></span>
          <Button variant="secondary" size="small"
                  disabled={downloading === 'residents_closure'}
                  on:click={() => downloadLetter('residents_closure', 'residents notice')}>
            {downloading === 'residents_closure' ? 'Generating…' : '📄 Residents notice'}
          </Button>
          <Button variant="primary" size="small"
                  on:click={() => openForm('closure_residents',
                    'Record residents notice',
                    'Residents block notice issued')}>
            ✓ Record residents notice
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── Nudge 3: Staleness ─────────────────────────────────────────────── -->
  {#if stale}
    <div class="mb-3 rounded-lg border border-slate-600/60 bg-slate-700/40 p-3 text-sm">
      <p class="text-slate-200 mb-2">
        💬 It's been more than 14 days since the reporter was last updated.
        Consider sending a holding update.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" size="small"
                disabled={downloading === 'reporter_holding'}
                on:click={() => downloadLetter('reporter_holding', 'holding letter')}>
          {downloading === 'reporter_holding' ? 'Generating…' : '📄 Draft holding letter'}
        </Button>
        <Button variant="primary" size="small"
                on:click={() => openForm('holding',
                  'Record reporter contact',
                  'Holding update sent to reporter')}>
          ✓ Record contact
        </Button>
        <Button variant="ghost" size="small"
                on:click={() => openForm('holding_snooze',
                  'Snooze this reminder',
                  'The nudge will disappear for 7 days.')}>
          Snooze 7 days
        </Button>
      </div>
    </div>
  {/if}

{/if}

<RecordContactForm
  show={showForm}
  saving={$morStore.saving}
  error={$morStore.error}
  kind={formKind}
  title={formTitle}
  subtitle={formSubtitle}
  on:submit={handleSubmit}
  on:close={() => { showForm = false; morStore.clearError(); }}
  on:clearError={() => morStore.clearError()}
/>
