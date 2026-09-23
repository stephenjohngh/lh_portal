<!-- src/lib/apps/compliance/components/ComplianceObligationsTab.svelte -->
<!-- Compliance > COMPLIANCE OBLIGATIONS: the register — what a higher-risk
     residential building in England must do, whether or not it applies here.

     ⭐ V2 OF docs/design/compliance_vocabulary.md. This and the planned
     obligations list used to be ONE tab, stacked, with the register on top and
     the work underneath. The user's reason for separating them is the whole
     point of the vocabulary work: *"I think UI would be better with separate
     tabs rather than sequential. For new user it is easier to differentiate."*
     ⚠ A TAB IS A CLAIM THAT TWO THINGS ARE DIFFERENT. Stacking them said they
     were one screen with two halves; this says what is true.

     ⚠ The sequence register → plan is still real, and it is now carried by the
     ACTIONS — the apply report's "Set them up →" — rather than by the scroll
     position. That is what the `goto` event below is for.

     ⭐ AND THE SPLIT MADE THIS TAB CHEAP. StatutoryTemplatePanel imports no
     component data at all — coverage comes from statutory_obligations.template_key
     and nothing here touches `components`. So opening the register no longer
     drags in 1,092 components, their attributes and their latest inspections;
     that load moved to the planned obligations tab, where the scope preview
     actually needs it. See ComplianceApp's activateTab. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { inspectionDefinitionsStore } from '../stores/inspectionDefinitionsStore.js';
  import StatutoryTemplatePanel from './StatutoryTemplatePanel.svelte';

  const dispatch = createEventDispatcher();

  /** A register row another tab asked to open — passed straight to the panel. */
  export let focusKey = null;

  // The register's coverage is computed against this building's planned
  // obligations, so the list is needed here even though none of it is edited
  // on this tab.
  $: ({ definitions } = $inspectionDefinitionsStore);

  onMount(() => {
    // ⚠ Both tabs load these, and that is deliberate rather than duplication:
    // either one can now be the first thing a person opens, and a tab that
    // depends on its sibling having been visited is a tab that is wrong half
    // the time. `load()` is guarded on the store already.
    if (definitions.length === 0) inspectionDefinitionsStore.load();
    // The recorded decisions about which entries apply to this building. Never
    // fatal — without them the gap report asks about everything, which is the
    // safe direction to fail in.
    inspectionDefinitionsStore.loadExclusions();
  });
</script>

<StatutoryTemplatePanel {definitions} {focusKey} on:goto on:showDisplayRegister />
