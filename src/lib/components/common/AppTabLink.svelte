<!-- src/lib/components/common/AppTabLink.svelte
     A link that opens another app AT a record in that app's own tab, reusing
     the tab when it is already open (#lib/utils/appLink.js openAppInTab;
     user, 2026-11-12). It is a real link to the same address, so a middle
     click, "open in new window" or copying the link still work as links do;
     only an ordinary click is taken over.

     Usage: <AppTabLink app="building_assets" params={{ component: id }}>or in its own tab ↗</AppTabLink> -->
<script>
  import { appHref, openAppInTab } from '#lib/utils/appLink.js';

  /** The app to open. */
  export let app;
  /** @type {Record<string,string>} what the app is to open */
  export let params = {};
  let className = 'text-xs text-purple-300 hover:underline';
  export { className as class };
  export let title = '';

  $: href = appHref(app, params);

  /** @param {MouseEvent} e */
  function click(e) {
    // Let the browser handle anything but a plain left click.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (openAppInTab(app, params) === 'blocked') return;   // a pop-up blocker: fall back to the link
    e.preventDefault();
  }
</script>

<a {href} target="_blank" rel="opener" class={className} title={title || undefined}
   data-testid="app-tab-link" on:click={click}><slot /></a>
