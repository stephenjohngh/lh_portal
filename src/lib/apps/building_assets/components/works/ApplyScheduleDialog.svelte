<!-- src/lib/apps/building_assets/components/works/ApplyScheduleDialog.svelte -->
<!-- "Schedule 12 was carried out" — and here is exactly what that will do to
     the asset records.

     This is the only place in Building Assets where one action rewrites many
     components at once, so it shows the change before making it, line by line,
     with the before and after side by side. The same principle the capital plan
     runs on: the derivation assists, the person decides.

     Nothing here computes anything — planApply did that. This only displays
     it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { actionLabel } from '../../utils/worksSchedule.js';

  export let show = false;
  /** { changes, unchanged, missing } from planApply(). */
  export let plan = null;
  /** type_attribute_id → label, so a change reads as "Wattage" not a uuid. */
  export let attrLabels = {};
  export let applying = false;

  const dispatch = createEventDispatcher();

  let error = '';

  $: changes   = plan?.changes   ?? [];
  $: unchanged = plan?.unchanged ?? [];
  $: missing   = plan?.missing   ?? [];

  export function fail(message) { error = message; }

  const nameOf = (c) => c?.asset_id || c?.label || 'Component';

  /** Only the attributes this line actually changes, named. */
  function changedAttrs(change) {
    const target = change.item?.target_attributes ?? {};
    return Object.entries(target).map(([id, value]) => ({
      label: attrLabels[id] ?? 'Attribute',
      value,
    }));
  }
</script>

<Modal bind:show title="Mark this schedule carried out" size="xlarge"
       on:close={() => dispatch('close')}>
  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}

  <div class="space-y-4">
    <div>
      <p class="text-sm text-slate-300">
        This will update <span class="text-white font-semibold">{changes.length}</span>
        asset record{changes.length === 1 ? '' : 's'} to match what the schedule
        says was done.
      </p>
      <p class="text-xs text-slate-500 mt-1">
        Lines already marked as carried out are not shown — you can run this
        again as more of the work comes back.
      </p>
    </div>

    {#if changes.length}
      <div class="border border-slate-700 rounded overflow-hidden">
        <table class="w-full text-xs">
          <thead class="bg-slate-800 text-slate-400 text-left">
            <tr>
              <th class="px-3 py-2 font-medium">Asset</th>
              <th class="px-3 py-2 font-medium">Action</th>
              <th class="px-3 py-2 font-medium">Now</th>
              <th class="px-3 py-2 font-medium">Becomes</th>
            </tr>
          </thead>
          <tbody>
            {#each changes as change (change.item.id)}
              <tr class="border-t border-slate-700/50">
                <td class="px-3 py-1.5 text-slate-200">{nameOf(change.component)}</td>
                <td class="px-3 py-1.5 text-slate-400">{actionLabel(change.item.action)}</td>
                <td class="px-3 py-1.5 text-slate-500">
                  {change.component.type_code} · {change.component.status}
                </td>
                <td class="px-3 py-1.5">
                  {#if change.patch?.type_code}
                    <span class="text-purple-300">{change.patch.type_code}</span>
                  {/if}
                  {#if change.patch?.status}
                    <span class="text-purple-300">· {change.patch.status}</span>
                  {/if}
                  {#each changedAttrs(change) as attr}
                    <span class="block text-teal-300">{attr.label} → {attr.value}</span>
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="text-sm text-slate-400 py-4 text-center">
        Nothing to change — every line is either already applied or asks for
        something the asset already says.
      </p>
    {/if}

    {#if unchanged.length}
      <p class="text-xs text-slate-500">
        {unchanged.length} line{unchanged.length === 1 ? '' : 's'} will not change
        anything — listed for information, or the asset already matches. They are
        left as outstanding so they are not lost.
      </p>
    {/if}

    {#if missing.length}
      <div class="p-3 rounded border border-amber-500/40 bg-amber-500/10">
        <p class="text-xs text-amber-200">
          {missing.length} line{missing.length === 1 ? '' : 's'} name a component
          that no longer exists. They cannot be applied.
        </p>
      </div>
    {/if}

    <p class="text-xs text-slate-500 border-t border-slate-700 pt-3">
      Each change is recorded against the asset, so its history will show what
      was done, when, and which schedule said so.
    </p>
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={applying} on:click={() => dispatch('close')}>
      Cancel
    </Button>
    <Button variant="primary" disabled={applying || !changes.length}
            on:click={() => dispatch('apply')}>
      {applying ? 'Updating…' : `Update ${changes.length} asset${changes.length === 1 ? '' : 's'}`}
    </Button>
  </div>
</Modal>
