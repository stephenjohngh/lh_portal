<!-- src/lib/apps/building_assets/components/InspectionReadings.svelte -->
<!--
  Renders the structured numeric/text readings recorded against one inspection
  (component_inspections.readings — G2, migration 169). The text/number sibling
  of ConditionChecklistChips; both are fed from lookups.js.

  A reading is a measured value, not a pass/fail — for BS 5266-1 emergency
  lighting the annual duration achieved and lux level ARE the evidence — so the
  value is given visual weight and the attribute name reads as its label. Units
  live inside the attribute name by convention ("Duration achieved (min)").

  Props:
    items — [{ def, value }] from readingsDisplay(); only recorded readings are
            present, so an empty array renders nothing and the caller should
            omit its section heading too.

  Note: inspections recorded before migration 169 carry their readings as prose
  in inspector_notes and will produce no items here — that is expected, not a
  gap in the data.
-->
<script>
  /** @type {Array<{ def: { id: string, name: string }, value: string|number }>} */
  export let items = [];
</script>

{#if items.length > 0}
  <dl class="rd-list">
    {#each items as { def, value } (def.id)}
      <div class="rd-item">
        <dt class="rd-label">{def.name}</dt>
        <dd class="rd-value">{value}</dd>
      </div>
    {/each}
  </dl>
{/if}

<style>
  .rd-list  { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; }
  .rd-item  { display: flex; flex-direction: column; gap: 0.1rem; background: rgb(15 23 42 / 0.4); border: 1px solid rgb(71 85 105 / 0.5); border-radius: 6px; padding: 0.4rem 0.7rem; min-width: 6rem; }
  .rd-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(100 116 139); }
  .rd-value { margin: 0; font-size: 0.95rem; font-weight: 600; color: rgb(226 232 240); font-variant-numeric: tabular-nums; }
</style>
