<!-- src/lib/apps/building_assets/BuildingAssetsApp.svelte -->
<!-- Thin tab shell: loads the store, renders tab navigation,
     and delegates to the active tab component. -->
<script>
  import { get } from 'svelte/store';
  import AppGate from '#lib/components/common/AppGate.svelte';
  import TabBar from '#lib/components/common/TabBar.svelte';
  import { buildingAssetsStore } from './stores/buildingAssetsStore.js';

  import TypeBrowser      from './components/TypeBrowser.svelte';
  import ComponentsTab    from './components/ComponentsTab.svelte';
  import PlanViewTab      from './components/PlanViewTab.svelte';
  import SpacesTab        from './components/SpacesTab.svelte';
  import WorksTab       from './components/works/WorksTab.svelte';

  let activeTab   = 'components';

  $: store      = $buildingAssetsStore;
  $: systems    = store.systems;
  $: types      = store.types;
  $: attrDefs   = store.attrDefs;
  $: attrOptions = store.attrOptions;
  $: components = store.components;

  // The store is a module singleton, but this component is destroyed and
  // recreated every time the app is re-selected (the shell swaps it via
  // <svelte:component>). Only load what's missing, and when nothing is
  // missing AppGate draws the app at once instead of re-fetching + flashing.
  const snapshot        = get(buildingAssetsStore);
  const needsHierarchy  = snapshot.systems.length === 0;
  const needsComponents = snapshot.components.length === 0;
  const alreadyLoaded   = !needsHierarchy && !needsComponents;

  // Independent fetch chains — run concurrently to halve startup latency.
  const loadAssets = () => Promise.all([
    needsHierarchy  ? buildingAssetsStore.load()           : Promise.resolve(),
    needsComponents ? buildingAssetsStore.loadComponents() : Promise.resolve(),
  ]);

  // ⛔ THERE IS NO INSPECTIONS TAB HERE ANY MORE (C4, 2026-09-21) and it must
  // not come back. It rendered the INSPECTION app's `walk_sessions` with the
  // Inspection app's helpers and deleted through its `public.js` — homeless
  // rather than misnamed, which is why renaming it would have settled
  // nothing. It is now **Compliance → Inspection walks**.
  // ⚠ The component-shaped question stays here and always did:
  // `ComponentInspectionHistory` in the detail panel answers "what condition
  // is this component in", which is what a tab in THIS app should be for.
  // docs/design/compliance_app_design.md §1.1.
  $: TABS = [
    { key: 'components', label: 'Components',   icon: '🧩', count: components.length || null },
    { key: 'plans',      label: 'Plan View',    icon: '🗺' },
    { key: 'spaces',     label: 'Spaces',       icon: '⬡' },
    { key: 'works',      label: 'Works',        icon: '🛠' },
    { key: 'types',      label: 'Type Browser', icon: '🗂', count: types.length || null },
  ];
</script>

<div class="text-white">
  <!-- Nothing is drawn until the first load has finished: before it every list
       is empty because it has not been read, and the tabs said "No components
       yet" / "No spaces have been drawn yet" for the moment they showed. -->
  <AppGate appId="building_assets" name="Building assets" load={loadAssets} {alreadyLoaded}>

  <!-- A later reload (after an edit) keeps the tab on screen and says so here. -->
  {#if store.loading}
    <div class="text-slate-400 text-sm mb-4">Loading…</div>
  {/if}

  <!-- Data model banner — only shown after load completes and DB is genuinely empty -->
  {#if !store.loading && systems.length === 0}
    <div class="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
      <p class="font-semibold mb-1">⚠ No data found</p>
     </div>
  {/if}

  <div class="mb-6">
    <TabBar tabs={TABS} active={activeTab} on:select={(e) => activeTab = e.detail} />
  </div>

  {#if activeTab === 'types'}
    <TypeBrowser {systems} {types} {attrDefs} {attrOptions} />
  {:else if activeTab === 'components'}
    <ComponentsTab />
  {:else if activeTab === 'plans'}
    <PlanViewTab />
  {:else if activeTab === 'spaces'}
    <SpacesTab />
  {:else if activeTab === 'works'}
    <WorksTab />
  {/if}

  </AppGate>
</div>
