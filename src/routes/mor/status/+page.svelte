<!-- src/routes/mor/status/+page.svelte -->
<!-- Public resident status lookup. No authentication required.
     Pre-fills the reference from ?ref= so the post-submission confirmation
     page can link straight here. The resident still has to enter their
     verification code, which acts as a bearer token. -->
<script>
  import { onMount } from 'svelte';
  import { page }     from '$app/stores';
  import lhLogo       from '$lib/assets/LH_services_logo.png';
  import {
    normalizeVerificationCode,
    formatVerificationCode,
  } from '$lib/utils/caseVerificationCode';

  // ── Form state ───────────────────────────────────────────────────────
  let reference   = '';
  let code        = '';
  let loading     = false;
  let lookupError = '';

  // ── Result state ─────────────────────────────────────────────────────
  let result = null;

  // ── Validation errors ────────────────────────────────────────────────
  let refError  = '';
  let codeError = '';

  const REFERENCE_RE = /^MOR-\d{4}-\d{6}$/i;
  const PHASE_STEPS = [
    { phase: 'received',   label: 'Received'  },
    { phase: 'reviewing',  label: 'Reviewing' },
    { phase: 'reported',   label: 'Reported'  },
    { phase: 'fixing',     label: 'Fixing'    },
    { phase: 'closed',     label: 'Closed'    },
  ];

  // Pre-fill reference from ?ref= query param.
  onMount(() => {
    const q = $page.url.searchParams.get('ref');
    if (q) reference = q.trim().toUpperCase();
  });

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      }) + ' ' + d.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  function validate() {
    refError  = '';
    codeError = '';
    const refTrim = reference.trim().toUpperCase();
    if (!REFERENCE_RE.test(refTrim)) {
      refError = "Reference should look like MOR-2026-000001";
      return false;
    }
    const normalised = normalizeVerificationCode(code);
    if (!normalised) {
      codeError = 'Enter the 6-character verification code from your confirmation.';
      return false;
    }
    return true;
  }

  async function handleLookup() {
    lookupError = '';
    if (!validate()) return;

    const refTrim    = reference.trim().toUpperCase();
    const normalised = normalizeVerificationCode(code);

    loading = true;
    try {
      const r = await fetch(`/api/mor/status/${encodeURIComponent(refTrim)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: normalised }),
      });
      const data = await r.json();
      if (!r.ok) {
        lookupError = data.error ?? "We couldn't look up that report.";
        result = null;
      } else {
        result = data;
      }
    } catch {
      lookupError = 'Network error. Please check your connection and try again.';
    } finally {
      loading = false;
    }
  }

  function lookupAnother() {
    result      = null;
    code        = '';
    lookupError = '';
    refError    = '';
    codeError   = '';
  }

  /** Highlight code as the user types: "r7p qk2" → "R7P-QK2" (display only). */
  function onCodeInput(e) {
    const cursor = e.target.selectionStart;
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
    code = cleaned.length > 3 ? cleaned.slice(0, 3) + '-' + cleaned.slice(3, 6) : cleaned;
    // Keep cursor roughly where the user left it.
    requestAnimationFrame(() => {
      try { e.target.setSelectionRange(cursor + 1, cursor + 1); } catch {}
    });
  }
</script>

<svelte:head>
  <title>Check the status of a safety report</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="shell">
  <header class="hdr">
    <img src={lhLogo} alt="LH Services" class="logo" />
  </header>

  <main class="main">

    {#if !result}
      <!-- ── Lookup form ──────────────────────────────────────────────── -->
      <h1 class="page-title">Check your report</h1>
      <p class="page-subtitle">
        Enter the reference number and verification code from your confirmation
        to see how your safety report is progressing.
      </p>

      <form on:submit|preventDefault={handleLookup} class="form" novalidate>

        <div class="field">
          <label for="ref" class="label">Reference number</label>
          <input
            id="ref"
            type="text"
            inputmode="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={reference}
            on:input={() => reference = reference.toUpperCase()}
            class="input mono {refError ? 'error-border' : ''}"
            placeholder="MOR-2026-000001"
          />
          {#if refError}<p class="field-error">{refError}</p>{/if}
        </div>

        <div class="field">
          <label for="code" class="label">Verification code</label>
          <p class="hint">Six letters and numbers, e.g. R7P-QK2.</p>
          <input
            id="code"
            type="text"
            inputmode="text"
            autocomplete="off"
            spellcheck="false"
            value={code}
            on:input={onCodeInput}
            class="input mono {codeError ? 'error-border' : ''}"
            placeholder="R7P-QK2"
            maxlength="7"
          />
          {#if codeError}<p class="field-error">{codeError}</p>{/if}
        </div>

        {#if lookupError}
          <div class="submit-error">{lookupError}</div>
        {/if}

        <button type="submit" class="submit-btn" disabled={loading}>
          {loading ? 'Looking up…' : 'Check status'}
        </button>

        <p class="lost-code">
          Lost your reference or code? Please contact the building office.
        </p>

        <p class="report-link-wrap">
          Need to report something new?
          <a class="report-link" href="/mor/report">Submit a safety concern →</a>
        </p>

      </form>

    {:else}
      <!-- ── Status display ───────────────────────────────────────────── -->

      <div class="result-header">
        <p class="result-label">Status of report</p>
        <p class="result-refnum">{result.reference}</p>
        {#if result.urgency}
          <span class="urgency-flag">⚠ Marked urgent</span>
        {/if}
      </div>

      <div class="phase-box phase-{result.phase}">
        <p class="phase-label">{result.phase_label}</p>
        <p class="phase-desc">{result.phase_description}</p>
      </div>

      <!-- Progress steps -->
      <div class="steps">
        {#each PHASE_STEPS as s, i}
          {@const reached = result.step >= i + 1}
          {@const current = result.step === i + 1 && result.phase !== 'not_proceeding'}
          <div class="step {reached ? 'step-reached' : ''} {current ? 'step-current' : ''}">
            <div class="step-dot">{reached ? '✓' : i + 1}</div>
            <div class="step-label">{s.label}</div>
          </div>
          {#if i < PHASE_STEPS.length - 1}
            <div class="step-bar {result.step > i + 1 ? 'step-bar-done' : ''}"></div>
          {/if}
        {/each}
      </div>

      <!-- Milestones -->
      <div class="milestones">
        <h2>Timeline</h2>
        <ul>
          <li>
            <span class="milestone-key">Report submitted</span>
            <span class="milestone-val">{fmtDate(result.submitted_at)}</span>
          </li>
          {#if result.milestones.acknowledged}
            <li>
              <span class="milestone-key">Acknowledged</span>
              <span class="milestone-val">{fmtDate(result.milestones.acknowledged)}</span>
            </li>
          {/if}
          {#if result.milestones.reviewed}
            <li>
              <span class="milestone-key">Initial review complete</span>
              <span class="milestone-val">{fmtDate(result.milestones.reviewed)}</span>
            </li>
          {/if}
          {#if result.milestones.decided}
            <li>
              <span class="milestone-key">Decision recorded</span>
              <span class="milestone-val">{fmtDate(result.milestones.decided)}</span>
            </li>
          {/if}
          {#if result.milestones.closed}
            <li>
              <span class="milestone-key">Case closed</span>
              <span class="milestone-val">{fmtDate(result.milestones.closed)}</span>
            </li>
          {/if}
        </ul>
        <p class="last-updated">Last updated {fmtDate(result.last_updated_at)}</p>
      </div>

      <p class="emergency-note">
        If a situation becomes an immediate danger, call <strong>999</strong>.
      </p>

      <div class="actions">
        <button type="button" class="secondary-btn" on:click={lookupAnother}>
          ← Check another report
        </button>
      </div>

    {/if}

  </main>
</div>

<style>
  :global(body) { background: #f8fafc; margin: 0; }

  .shell {
    min-height: 100vh;
    background: #f8fafc;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #1e293b;
  }

  .hdr {
    background: #0f172a;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #1e293b;
  }
  .logo { height: 38px; width: auto; display: block; }

  .main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }

  /* ── Lookup form ── */
  .page-title {
    font-size: 1.625rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    color: #0f172a;
    line-height: 1.25;
  }
  .page-subtitle {
    color: #475569;
    font-size: 0.9375rem;
    margin: 0 0 1.75rem;
    line-height: 1.6;
  }

  .form { display: flex; flex-direction: column; gap: 1.5rem; }
  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .label { font-size: 0.9375rem; font-weight: 600; color: #1e293b; }
  .hint  { font-size: 0.8125rem; color: #64748b; margin: 0; line-height: 1.5; }

  .input {
    width: 100%;
    padding: 0.75rem;
    border: 1.5px solid #cbd5e1;
    border-radius: 0.5rem;
    font-size: 1rem;
    color: #1e293b;
    background: #fff;
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  .input.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    letter-spacing: 0.05em;
  }
  .input:focus {
    outline: none;
    border-color: #3c9683;
    box-shadow: 0 0 0 3px rgba(60, 150, 131, 0.15);
  }
  .error-border { border-color: #dc2626; }
  .field-error  { font-size: 0.8125rem; color: #dc2626; margin: 0; }

  .submit-error {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: #991b1b;
  }

  .submit-btn {
    width: 100%;
    padding: 0.875rem;
    background: #1e293b;
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    min-height: 44px;
  }
  .submit-btn:hover:not(:disabled) { background: #0f172a; }
  .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .lost-code {
    font-size: 0.8125rem;
    color: #64748b;
    margin: 0;
    text-align: center;
    line-height: 1.5;
  }

  .report-link-wrap {
    font-size: 0.875rem;
    color: #64748b;
    text-align: center;
    margin: 0;
  }
  .report-link {
    color: #3c9683;
    text-decoration: none;
    font-weight: 600;
    margin-left: 0.25rem;
  }
  .report-link:hover { color: #2d7a6a; text-decoration: underline; }

  /* ── Result display ── */
  .result-header {
    background: #fff;
    border: 1.5px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 1.25rem 1.5rem;
    text-align: center;
    margin-bottom: 1rem;
  }
  .result-label {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 0.25rem;
  }
  .result-refnum {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, monospace;
    color: #0f172a;
    margin: 0;
  }
  .urgency-flag {
    display: inline-block;
    margin-top: 0.5rem;
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fca5a5;
    border-radius: 999px;
    padding: 0.1rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .phase-box {
    background: #fff;
    border: 1.5px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }
  .phase-box.phase-received       { border-color: #93c5fd; background: #eff6ff; }
  .phase-box.phase-reviewing      { border-color: #fcd34d; background: #fffbeb; }
  .phase-box.phase-reported       { border-color: #fdba74; background: #fff7ed; }
  .phase-box.phase-fixing         { border-color: #86efac; background: #f0fdf4; }
  .phase-box.phase-closed         { border-color: #6ee7b7; background: #ecfdf5; }
  .phase-box.phase-not_proceeding { border-color: #cbd5e1; background: #f8fafc; }

  .phase-label {
    font-size: 1.125rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 0.4rem;
  }
  .phase-desc {
    font-size: 0.9375rem;
    color: #475569;
    margin: 0;
    line-height: 1.6;
  }

  /* ── Progress steps ── */
  .steps {
    display: flex;
    align-items: center;
    padding: 1rem 0.5rem;
    margin-bottom: 1rem;
    overflow-x: auto;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 auto;
    text-align: center;
    min-width: 4rem;
  }
  .step-dot {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: #e2e8f0;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 700;
  }
  .step-reached .step-dot { background: #3c9683; color: #fff; }
  .step-current .step-dot {
    box-shadow: 0 0 0 4px rgba(60, 150, 131, 0.2);
  }
  .step-label {
    font-size: 0.75rem;
    color: #64748b;
    margin-top: 0.4rem;
  }
  .step-reached .step-label { color: #1e293b; font-weight: 500; }
  .step-bar {
    flex: 1 1 auto;
    height: 2px;
    background: #e2e8f0;
    margin: 0 -0.25rem;
    margin-top: -1rem;
    min-width: 1rem;
  }
  .step-bar-done { background: #3c9683; }

  /* ── Milestones ── */
  .milestones {
    background: #fff;
    border: 1.5px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }
  .milestones h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 0.875rem;
  }
  .milestones ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid #f1f5f9;
  }
  .milestones li {
    display: flex;
    justify-content: space-between;
    padding: 0.625rem 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.875rem;
    gap: 0.5rem;
  }
  .milestone-key { color: #475569; }
  .milestone-val { color: #0f172a; font-weight: 500; text-align: right; }
  .last-updated {
    margin: 0.875rem 0 0;
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: right;
  }

  .emergency-note {
    text-align: center;
    font-size: 0.8125rem;
    color: #b91c1c;
    margin: 0 0 1.25rem;
  }

  .actions { display: flex; gap: 0.75rem; }
  .secondary-btn {
    flex: 1;
    padding: 0.75rem;
    background: #fff;
    color: #1e293b;
    border: 1.5px solid #cbd5e1;
    border-radius: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    min-height: 44px;
    transition: background 0.15s, border-color 0.15s;
  }
  .secondary-btn:hover { background: #f1f5f9; border-color: #94a3b8; }

  @media (max-width: 480px) {
    .step { min-width: 3.5rem; }
    .step-label { font-size: 0.6875rem; }
  }
</style>
