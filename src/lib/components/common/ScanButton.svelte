<!-- src/lib/components/common/ScanButton.svelte
     A 📷 button that opens the camera reader (TextScanner) and hands back what
     was picked (2026-10-10). Put it beside any field a person would otherwise
     copy off a label, a display or a door:

       <ScanButton profile="reading" title="Scan: Pressure"
         on:scanned={(e) => (value = e.detail.value)} />

     `profile` says what is being read (scanMatch.js SCAN_PROFILES):
     registration · number (door/riser numbers) · reading (a gauge or display)
     · code (asset tag, serial). `candidates` are the values the screen already
     knows, offered first when what was read is close to one of them.
     ⛔ Not for prose — notes and names are better dictated with the phone's
     keyboard than read off a picture.
     Scoped styles, so it sits in the phone apps (dark, 44px) and the standard
     apps alike; the accent follows `accent`. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import TextScanner from './TextScanner.svelte';

  export let profile = 'number';
  /** @type {Array<{ value: string, label?: string }>} */
  export let candidates = [];
  export let title = '';
  /** Text beside the camera icon; empty for the icon alone. */
  export let label = 'SCAN';
  export let accent = 'var(--lh-accent, #3c9683)';
  export let disabled = false;

  const dispatch = createEventDispatcher();
  let open = false;

  /** @param {CustomEvent<{ value: string, candidate: any }>} e */
  function picked(e) {
    open = false;
    dispatch('scanned', e.detail);
  }
</script>

<button type="button" class="sb" style="--sb-accent: {accent}" {disabled}
  title={title || 'Read it with the camera'} aria-label={title || 'Read it with the camera'}
  on:click={() => (open = true)}>
  <span aria-hidden="true">📷</span>{#if label}<span class="sb-lbl">{label}</span>{/if}
</button>

{#if open}
  <TextScanner {profile} {candidates} {title} {accent} on:pick={picked} on:close={() => (open = false)} />
{/if}

<style>
  .sb {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
    flex: 0 0 auto; min-height: 44px; min-width: 44px; padding: 0 0.7rem;
    background: transparent; color: var(--sb-accent);
    border: 1.5px solid var(--sb-accent); border-radius: 8px;
    font: inherit; font-size: 0.75rem; letter-spacing: 0.06em; cursor: pointer;
  }
  .sb:disabled { opacity: 0.4; cursor: not-allowed; }
  .sb-lbl { white-space: nowrap; }
</style>
