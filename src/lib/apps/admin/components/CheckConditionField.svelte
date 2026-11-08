<!-- src/lib/apps/admin/components/CheckConditionField.svelte
     "Applies to" for a condition attribute (migration 286): every component of the
     type, or only those where one fixed attribute has a value. Edits `value`, the
     type_attributes.applies_when list. -->
<script>
  import { buildingAssetsStore } from '#lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { inp } from '#lib/apps/building_assets/ui.js';
  import { conditionFor, describeCondition } from '#lib/apps/building_assets/utils/checkApplies.js';

  /** @type {any[]|null} */
  export let value = null;
  /** The fixed attributes the check can depend on (the type's or the system's). */
  export let fixedDefs = [];
  export let idPrefix = 'cond';

  const sel = inp + ' cursor-pointer';
  const first = value?.[0] ?? null;

  let attrName = first?.defName ?? '';
  let op       = first?.op ?? 'is_true';
  let chosen   = Array.isArray(first?.values) ? first.values[0] ?? '' : first?.values ?? '';

  $: names = [...new Set(fixedDefs.map((d) => d.name))];
  $: fixedDef = fixedDefs.find((d) => d.name === attrName) ?? null;
  $: isTick = fixedDef?.display_type === 'checkbox';
  $: options = fixedDef ? ($buildingAssetsStore.attrOptions?.[fixedDef.id] ?? []).map((o) => o.value) : [];
  $: if (fixedDef && isTick && op !== 'is_true' && op !== 'is_false') op = 'is_true';
  $: if (fixedDef && !isTick && (op === 'is_true' || op === 'is_false')) op = options.length ? 'in' : 'eq_text';

  $: value = fixedDef ? conditionFor(fixedDef, op, chosen) : null;
</script>

<div class="space-y-1 rounded border border-green-800/40 p-2">
  <label for="{idPrefix}-attr" class="block text-xs text-green-300">Applies to</label>
  <select id="{idPrefix}-attr" bind:value={attrName} class={sel}>
    <option value="">Every component of the type</option>
    {#each names as n}<option value={n}>Only where {n}…</option>{/each}
  </select>

  {#if fixedDef}
    {#if isTick}
      <select bind:value={op} class={sel} aria-label="Condition">
        <option value="is_true">is ticked</option>
        <option value="is_false">is not ticked</option>
      </select>
    {:else if options.length}
      <select bind:value={chosen} class={sel} aria-label="Value">
        <option value="">Choose a value…</option>
        {#each options as o}<option value={o}>is {o}</option>{/each}
      </select>
    {:else}
      <input bind:value={chosen} class={inp} placeholder="is (exact value)" aria-label="Value" />
    {/if}
    <p class="text-[11px] text-slate-400">{describeCondition({ applies_when: value })}. Elsewhere the walk does not ask it.</p>
  {/if}
</div>
