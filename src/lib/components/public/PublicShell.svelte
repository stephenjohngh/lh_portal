<!-- src/lib/components/public/PublicShell.svelte -->
<!-- The frame of a page anyone can open without signing in (a parking application,
     a status lookup). Deliberately LIGHT where the portal is dark, with the same
     logo and teal accent, so it reads as "the same organisation, not the portal":
     a person on a public form must never mistake it for the signed-in app, and the
     portal's own controls (Button, FormInput) are dark-theme. The few controls a
     public page needs come from here: Button variant="public". -->
<script>
  import { LOGO as lhLogo, LOGO_ALT } from '#lib/branding.js';

  /** 'sm' (a lookup) | 'md' (a form). */
  export let width = 'md';
  const widths = { sm: 'max-w-md', md: 'max-w-xl' };
</script>

<div class="min-h-screen bg-slate-50 text-slate-900">
  <header class="bg-slate-900 px-4 py-3 border-b-4 border-teal-600">
    <img src={lhLogo} alt={LOGO_ALT} class="h-9 w-auto" />
  </header>
  <main class="{widths[width] || widths.md} mx-auto px-4 py-6 space-y-5">
    <slot />
  </main>
</div>
