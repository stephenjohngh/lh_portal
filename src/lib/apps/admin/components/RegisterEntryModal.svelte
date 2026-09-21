<!-- src/lib/apps/admin/components/RegisterEntryModal.svelte -->
<!--
  Add or edit a periodic-register requirement. R2 of
  docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.

  ⛔ THE POINT OF THIS SCREEN: a person who learns a new regulation is in force
  could already schedule the WORK (+ New inspection) and could not register the
  DUTY. An obligation whose template_key is absent from the register is skipped
  by templateCoverage() entirely — it never counts toward coverage and never
  reaches the statement. This is where the duty gets registered.

  ⚠ Thirty-five fields is too many to meet at once, so the specialist ones sit
  in collapsed sections. What is open by default is what a new requirement
  actually needs: what it is, what requires it, when it applies, how often, and
  who bears it.

  ⛔ Provenance is shown, never edited here. Whether a row came from the standard
  register or was typed in this building is a fact about how it arrived, and
  recording a citation check is its own deliberate act — the register's shape
  for a decision someone may later have to justify is source + name + date.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { fmtDate } from '$lib/utils/dates.js';
  import {
    GROUPS, GROUP_LABEL, BASIS, BASIS_LABEL, BASIS_DESCRIPTION,
    HANDLED_BY_LABEL, TRIGGER_TYPE_LABEL,
  } from '$lib/utils/statutoryTemplate.js';
  import { EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';
  import { problemsByField, suggestKey } from '$lib/utils/registerEntryRules.js';

  /** @type {Object|null} null = adding a new requirement */
  export let entry = null;
  /** @type {{origin?: string, seedModifiedAt?: string|null, citationVerifiedBy?: string|null}} */
  export let provenance = {};
  export let saving = false;

  const dispatch = createEventDispatcher();

  // -- Recording that the citation has been checked ----------------------------
  // ⚠ Its own act, not two fields among thirty-five. The register's established
  // shape for a decision someone may later have to justify is source + name +
  // date, append-only — the same shape `statutory_exclusions` uses.
  let verifying = false;
  let verifyUrl = '';
  let verifyOn = new Date().toISOString().slice(0, 10);

  const isNew = !entry;
  let e = {
    key: '', name: '', description: '', group: 'fire_safety', basis: 'statute',
    statutoryRef: '', appliesWhen: 'Always', trigger: null, triggerType: null,
    triggerSource: null, frequencyDays: null, maxIntervalDays: null,
    intervalBasis: 'practice', sourceIntervalWords: null,
    maxIsSchedulingTolerance: false, evidencedBy: null, handledBy: 'none',
    responsibleParty: '', statutoryDutyHolder: '', competencyRequired: null,
    evidenceRequired: '', retentionBasis: null, retentionPeriodMonths: 36,
    handlingNote: '', reviewerNote: null,
    operationallyIncomplete: false, completionAction: null,
    ...(entry ?? {}),
  };

  // The key is the identity obligations and decisions link on, so it is settable
  // once and never again. Suggested from the name until the person edits it.
  let keyTouched = !isNew;
  $: if (isNew && !keyTouched && e.name) e.key = suggestKey(e.name);

  let attempted = false;
  $: problems = problemsByField(e, { isNew });
  $: blocking = Object.keys(problems).length > 0;
  const show = (f) => (attempted ? problems[f] ?? '' : '');

  let showCadence = true;
  let showOwners  = true;
  let showNotes   = false;
  let showFlags   = false;

  function save() {
    attempted = true;
    if (blocking) return;
    dispatch('save', { key: entry?.key ?? e.key, entry: e, isNew });
  }

  const opts = (values, label) => values.map(v => ({ value: v, label: label[v] ?? v }));
</script>

<Modal show={true} size="large"
       title={isNew ? 'Add a compliance obligation to the register' : 'Edit compliance obligation'}
       on:close={() => dispatch('close')}>
  <div class="reg-form">

    {#if isNew}
      <!-- ⭐ The one place "requirement" is still allowed on screen, and it is
           here on purpose: ISO 14001 defines a compliance obligation as legal
           requirements AND other requirements the organisation commits to,
           which is exactly what `basis` distinguishes. Saying so once, where
           somebody is creating one, is cheaper than a glossary. -->
      <p class="intro">
        This registers a <strong>compliance obligation</strong> — a duty a building of this kind
        has, and what says so. It covers both legal requirements and other requirements we commit
        to, which is what <em>Where it comes from</em> records. It is not the work itself: a
        <strong>planned obligation</strong> follows, from the register panel.
      </p>
    {/if}

    <!-- ── Provenance: shown, never edited ──────────────────────────────── -->
    {#if !isNew}
      <div class="prov" class:prov-local={provenance.origin === 'local'}>
        {#if provenance.origin === 'local'}
          <p><strong>⛔ Added in this building</strong> — not from the standard register.</p>
        {:else}
          <p><strong>From the standard register</strong>, as shipped.</p>
        {/if}

        {#if e.citationVerifiedAgainst}
          <p>
            ✓ Citation checked against
            <a href={e.citationVerifiedAgainst} target="_blank" rel="noopener">its source</a>,
            {fmtDate(e.citationVerifiedOn)}
            <span class="prov-scope">— the citation only, not the interval or whether it applies here</span>
          </p>
        {:else}
          <p class="prov-warn">⚠ This row’s citation has not been individually recorded.</p>
        {/if}

        {#if !verifying}
          <button class="prov-act" on:click={() => { verifying = true; verifyUrl = ''; }}>
            {e.citationVerifiedAgainst ? 'Record a fresh check' : 'Record a citation check'}
          </button>
        {:else}
          <div class="verify">
            <p class="verify-h">Record that this citation has been checked</p>
            <p class="verify-note">
              ⚠ This records that the <strong>reference</strong> was read against its source and
              found correct. It says nothing about whether the interval is right or whether the
              compliance obligation applies to this building — those are different questions and must not
              be implied by this one.
            </p>
            <FormInput label="Source checked against" bind:value={verifyUrl} required
              placeholder="https://www.legislation.gov.uk/uksi/2022/547/regulation/10"
              helpText="A link to the source, so anyone can check it again later." />
            <FormInput label="Checked on" type="date" bind:value={verifyOn} />
            <div class="verify-actions">
              <Button variant="secondary" size="small" disabled={saving}
                on:click={() => verifying = false}>Cancel</Button>
              <Button variant="primary" size="small" disabled={saving || !verifyUrl.trim()}
                on:click={() => dispatch('verify', { key: entry?.key, url: verifyUrl, on: verifyOn })}>
                Record
              </Button>
            </div>
          </div>
        {/if}

        {#if provenance.seedModifiedAt}
          <p class="prov-warn">
            ⚠ Edited here on {fmtDate(provenance.seedModifiedAt)} — it no longer matches the
            standard register, and an import will report the difference rather than overwrite it.
          </p>
        {/if}
      </div>
    {/if}

    <!-- ── What it is ───────────────────────────────────────────────────── -->
    <FormInput label="Name" bind:value={e.name} required error={show('name')}
      placeholder="e.g. Fire alarm — weekly test" />

    <FormInput label="Key" bind:value={e.key} required error={show('key')}
      disabled={!isNew}
      on:input={() => keyTouched = true}
      helpText={isNew
        ? 'Permanent. Planned obligations and applicability decisions link on this.'
        : 'Set when the compliance obligation was created and never changed — planned obligations link on it.'} />

    <FormTextarea label="Description" bind:value={e.description} rows={2} required
      error={show('description')} placeholder="What the check actually involves."
      helpText="What the check involves, in general. ⚠ Describe the check, not what this building has today — a description naming a current defect or project stops being true when the building changes, and nothing will tell you." />

    <div class="pair">
      <FormSelect label="Group" bind:value={e.group} options={opts(GROUPS, GROUP_LABEL)}
        placeholder="" error={show('group')} />
      <FormSelect label="Where it comes from" bind:value={e.basis} options={opts(BASIS, BASIS_LABEL)}
        placeholder="" error={show('basis')} helpText={BASIS_DESCRIPTION[e.basis] ?? ''} />
    </div>

    <FormTextarea label="Reference" bind:value={e.statutoryRef} rows={3} required
      error={show('statutoryRef')}
      placeholder="e.g. Fire Safety (England) Regulations 2022, reg 10(6)"
      helpText="The law, standard or contract that requires this. Without one, this is a note rather than a register entry." />

    <!-- ⛔ THE CATALOGUE RULE, WHERE SOMEBODY WOULD BREAK IT. The build plan §10
         says it must reach the editor, and `appliesWhen` is its mechanism: a
         requirement that does not apply TODAY is written as a CONDITION and
         switched off by a recorded decision, never left out and never described
         in the present tense. This register has been caught by that twice —
         a row was made unconditional because an AOV was recorded as installed
         (there is none), and a note justified a row "because a lift replacement
         is in prospect". Both read as facts and both stopped being true. -->
    <FormTextarea label="Applies when" bind:value={e.appliesWhen} rows={2} required
      error={show('appliesWhen')}
      helpText="When this applies. ⚠ Write the CONDITION, not today’s answer to it — “where a mechanical smoke ventilation system serves a stair”, never “not applicable, none installed”. Whether it is true here is a decision you record separately, and it changes without anyone editing this row. “Always” is a fine answer; an empty box is not." />

    <!-- ── Cadence ──────────────────────────────────────────────────────── -->
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="sec" on:click={() => showCadence = !showCadence}>
      <span class="chev" class:open={showCadence}>▸</span> How often, or what triggers it
    </div>
    {#if showCadence}
      <div class="sec-body">
        <div class="pair">
          <FormInput label="Every (days)" type="number" bind:value={e.frequencyDays}
            error={show('frequencyDays')}
            helpText="Leave empty if an event sets this off rather than a date, then fill in Trigger below." />
          <FormSelect label="Evidenced by" bind:value={e.evidencedBy}
            options={opts(['inspection', 'maintenance_job'], EVIDENCE_ROUTE_LABEL)}
            placeholder="Neither — not schedulable here"
            helpText="⚠ With neither a frequency nor a trigger this can never come due, and will read “never run” for ever." />
        </div>

        <FormTextarea label="Trigger" bind:value={e.trigger} rows={2}
          placeholder="e.g. On any significant change to the building"
          helpText="What sets this off, if it is not a regular cycle." />

        <div class="pair">
          <FormSelect label="Trigger type" bind:value={e.triggerType}
            options={Object.entries(TRIGGER_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Derived from the frequency" />
          <FormInput label="What detects it" bind:value={e.triggerSource}
            helpText="⚠ If nothing does, say so. That is a real answer, and several entries give it." />
        </div>

        <div class="pair">
          <FormSelect label="Interval basis" bind:value={e.intervalBasis}
            options={[
              { value: 'stated',   label: 'Stated by the reference' },
              { value: 'practice', label: 'Established practice — the reference sets the duty, not the frequency' },
            ]} placeholder="" />
          <FormInput label="Maximum interval (days)" type="number" bind:value={e.maxIntervalDays}
            error={show('maxIntervalDays')} />
        </div>

        <FormInput label="The source’s period, in its own words" bind:value={e.sourceIntervalWords}
          placeholder="e.g. at least every 3 months (FSER reg 10(6))"
          helpText="Quote the period in the source’s own words — “annually”, “every 3 months”. ⚠ No law or standard says “366 days”; that is our arithmetic on the word." />

        <Checkbox bind:checked={e.maxIsSchedulingTolerance}
          label="The day figure above is OUR scheduling tolerance, not a ceiling the source sets" />
      </div>
    {/if}

    <!-- ── Who ──────────────────────────────────────────────────────────── -->
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="sec" on:click={() => showOwners = !showOwners}>
      <span class="chev" class:open={showOwners}>▸</span> Who bears it, and who does it
    </div>
    {#if showOwners}
      <div class="sec-body">
        <FormTextarea label="Duty holder in law" bind:value={e.statutoryDutyHolder} rows={2}
          placeholder="e.g. Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)"
          helpText="Who bears the duty in law. ⚠ Not the same as who does the work — this list once said a legal duty belonged to a cleaner." />

        <div class="pair">
          <FormInput label="Performed by" bind:value={e.responsibleParty}
            placeholder="e.g. Fire alarm service contractor" />
          <FormSelect label="Dealt with in" bind:value={e.handledBy}
            options={Object.entries(HANDLED_BY_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="" />
        </div>

        <FormInput label="Competence required" bind:value={e.competencyRequired}
          placeholder="e.g. BAFE SP203-1 or equivalent third-party certification" />
        <FormTextarea label="Evidence required" bind:value={e.evidenceRequired} rows={2} />

        <div class="pair">
          <FormInput label="Retention (months)" type="number" bind:value={e.retentionPeriodMonths} />
          <FormInput label="Retention basis" bind:value={e.retentionBasis}
            helpText="Say where the figure comes from. ⚠ Nothing in this list has a retention period set by law." />
        </div>
      </div>
    {/if}

    <!-- ── Notes ────────────────────────────────────────────────────────── -->
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="sec" on:click={() => showNotes = !showNotes}>
      <span class="chev" class:open={showNotes}>▸</span> Notes
    </div>
    {#if showNotes}
      <div class="sec-body">
        <FormTextarea label="Handling note (internal)" bind:value={e.handlingNote} rows={3}
          helpText="How it is dealt with here. Internal only — it never appears in the statement you send out." />
        <FormTextarea label="Reviewer note" bind:value={e.reviewerNote} rows={3}
          helpText="The only note that appears in the statement you send out. Write what a reviewer should see." />
      </div>
    {/if}

    <!-- ── Status flags ─────────────────────────────────────────────────── -->
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="sec" on:click={() => showFlags = !showFlags}>
      <span class="chev" class:open={showFlags}>▸</span> Status of this row as a control
    </div>
    {#if showFlags}
      <div class="sec-body">
        <Checkbox bind:checked={e.operationallyIncomplete}
          label="Operationally incomplete — an interim measure that is not yet a usable control" />
        <FormTextarea label="Completion action" bind:value={e.completionAction} rows={2}
          helpText="Who will close this, by when, and who decides. ⚠ Left empty it prints NOT ASSIGNED, on purpose, so it stays visible until somebody fills it in." />
      </div>
    {/if}

    {#if attempted && blocking}
      <ErrorDisplay message={`${Object.keys(problems).length} field${Object.keys(problems).length === 1 ? '' : 's'} need attention.`} />
    {/if}

    <div class="actions">
      <Button variant="secondary" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
      <Button variant="primary" disabled={saving} on:click={save}>
        {saving ? 'Saving…' : isNew ? 'Add to the register' : 'Save'}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .reg-form { display: flex; flex-direction: column; gap: 0.15rem; }
  .intro {
    font-size: 0.82rem; line-height: 1.5; color: rgb(203 213 225);
    background: rgb(56 189 248 / 0.1); border-radius: 6px; padding: 0.55rem 0.7rem;
    margin-bottom: 0.6rem;
  }
  .prov {
    font-size: 0.78rem; line-height: 1.5; color: rgb(203 213 225);
    background: rgb(30 41 59 / 0.6); border: 1px solid rgb(71 85 105 / 0.6);
    border-radius: 6px; padding: 0.55rem 0.7rem; margin-bottom: 0.7rem;
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  .prov-local { border-color: rgb(251 191 36 / 0.5); background: rgb(251 191 36 / 0.08); }
  .prov a { color: rgb(134 239 172); text-decoration: underline; }
  .prov-scope { color: rgb(100 116 139); }
  .prov-warn { color: rgb(252 211 77); }
  .prov-act {
    align-self: flex-start; margin-top: 0.2rem; background: none; border: none;
    padding: 0; font-size: 0.76rem; color: rgb(125 211 252);
    text-decoration: underline; cursor: pointer;
  }
  .verify {
    margin-top: 0.4rem; padding-top: 0.5rem;
    border-top: 1px solid rgb(71 85 105 / 0.6);
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .verify-h { font-weight: 700; color: rgb(226 232 240); font-size: 0.8rem; }
  .verify-note { font-size: 0.74rem; color: rgb(148 163 184); line-height: 1.5; margin-bottom: 0.3rem; }
  .verify-actions { display: flex; justify-content: flex-end; gap: 0.4rem; margin-top: 0.2rem; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .sec {
    cursor: pointer; user-select: none; margin-top: 0.5rem;
    font-size: 0.8rem; font-weight: 600; color: rgb(203 213 225);
    border-top: 1px solid rgb(71 85 105 / 0.5); padding-top: 0.6rem;
  }
  .sec-body { padding-top: 0.5rem; }
  .chev { display: inline-block; transition: transform 0.12s; color: rgb(148 163 184); }
  .chev.open { transform: rotate(90deg); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.9rem; }
  @media (max-width: 640px) { .pair { grid-template-columns: 1fr; } }
</style>
