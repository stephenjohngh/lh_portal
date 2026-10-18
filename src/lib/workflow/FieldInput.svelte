<!-- src/lib/apps/cases/components/FieldInput.svelte -->
<!-- One field of a Cases process (migration 253), as the control its type
     needs. `value` is bound; the parent saves. A link field offers the
     portal's components, spaces or users — ⛔ a person is a portal user,
     never a resident. -->
<script>
  /** @type {{ key: string, label: string, type: string, options?: string[], help?: string|null, required_on_create?: boolean }} */
  export let field;
  /** @type {any} */
  export let value = '';
  /** What each link field offers (caseFields.linkOptions). */
  /** @type {any} */
  export let links = { component: [], space: [], person: [] };
  /** Show "needed to open" beside the label (the new-case form). */
  export let showNeeded = false;
  export let disabled = false;

  const id = `case-field-${Math.random().toString(36).slice(2, 9)}`;
  const cls = 'w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200';
  $: options = field.type === 'component' || field.type === 'space' || field.type === 'person' ? links?.[field.type] ?? [] : [];
</script>

<div class="space-y-1">
  <label for={id} class="block text-xs text-slate-400">
    {field.label}{#if showNeeded && field.required_on_create}<span class="text-amber-300"> · needed to open</span>{/if}
  </label>
  {#if field.type === 'long_text'}
    <textarea {id} rows="3" class={cls} bind:value {disabled}></textarea>
  {:else if field.type === 'date'}
    <input {id} type="date" class={cls} bind:value {disabled} />
  {:else if field.type === 'number'}
    <input {id} type="number" class={cls} bind:value {disabled} />
  {:else if field.type === 'yes_no'}
    <select {id} class={cls} bind:value {disabled}>
      <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>
    </select>
  {:else if field.type === 'choice'}
    <select {id} class={cls} bind:value {disabled}>
      <option value="">—</option>
      {#each field.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
    </select>
  {:else if options.length || field.type === 'component' || field.type === 'space' || field.type === 'person'}
    <select {id} class={cls} bind:value {disabled}>
      <option value="">—</option>
      {#each options as o (o.id)}<option value={o.id}>{o.text}</option>{/each}
      {#if value && !options.some((/** @type {any} */ o) => o.id === value)}<option value={value}>No longer in the portal</option>{/if}
    </select>
  {:else}
    <input {id} type="text" class={cls} bind:value {disabled} />
  {/if}
  {#if field.help}<p class="text-[11px] text-slate-500">{field.help}</p>{/if}
</div>
