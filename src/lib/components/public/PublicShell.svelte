<!-- src/lib/components/public/PublicShell.svelte -->
<!-- The frame of a page anyone can open without signing in (a parking application,
     a safety report, a status lookup). Deliberately LIGHT where the portal is dark,
     with the same logo and teal accent, so it reads as "the same organisation, not
     the portal": a person on a public form must never mistake it for the signed-in
     app, and the portal's own controls (Button, FormInput) are dark-theme.
     It also owns the public FIELD KIT — .page-title, .page-subtitle, .form, .field,
     .label, .hint, .input/.textarea, .field-error, .submit-error — as global classes
     under .public-page, so a public form is written once, not styled per page.
     Its button is Button variant="public". -->
<script>
  import { LOGO as lhLogo, LOGO_ALT } from '#lib/branding.js';

  /** 'sm' (a lookup) | 'md' (a form) | 'lg' (a longer report form) | 'xl' (an article). */
  export let width = 'md';
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-[40rem]', xl: 'max-w-3xl' };
  /** Where the logo goes; omit for no link. */
  export let logoHref = '';
</script>

<div class="public-page min-h-screen bg-slate-50 text-slate-900">
  <header class="bg-slate-900 px-4 py-3 border-b-4 border-teal-600 flex items-center gap-6">
    {#if logoHref}<a href={logoHref}><img src={lhLogo} alt={LOGO_ALT} class="h-9 w-auto" /></a>
    {:else}<img src={lhLogo} alt={LOGO_ALT} class="h-9 w-auto" />{/if}
    <slot name="nav" />
  </header>
  <main class="{widths[width] || widths.md} mx-auto px-4 py-6 pb-12 space-y-5">
    <slot />
  </main>
</div>

<style>
  :global(.public-page .page-title) { font-size: 1.625rem; font-weight: 700; margin: 0 0 0.5rem; color: #0f172a; line-height: 1.25; }
  :global(.public-page .page-subtitle) { color: #475569; font-size: 0.9375rem; margin: 0 0 1.75rem; line-height: 1.6; }
  :global(.public-page .form) { display: flex; flex-direction: column; gap: 1.5rem; }
  :global(.public-page .field) { display: flex; flex-direction: column; gap: 0.4rem; }
  :global(.public-page .label) { font-size: 0.9375rem; font-weight: 600; color: #1e293b; }
  :global(.public-page .req) { color: #dc2626; }
  :global(.public-page .opt) { color: #94a3b8; font-weight: 400; font-size: 0.8125rem; }
  :global(.public-page .hint) { font-size: 0.8125rem; color: #64748b; margin: 0; line-height: 1.5; }
  :global(.public-page .input), :global(.public-page .textarea) {
    width: 100%; padding: 0.625rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 0.5rem;
    font-size: 1rem; color: #1e293b; background: #fff; box-sizing: border-box; font-family: inherit;
    transition: border-color 0.15s;
  }
  :global(.public-page .input.mono) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; letter-spacing: 0.05em; }
  :global(.public-page .input:focus), :global(.public-page .textarea:focus) {
    outline: none; border-color: #3c9683; box-shadow: 0 0 0 3px rgba(60, 150, 131, 0.15);
  }
  :global(.public-page .textarea) { resize: vertical; line-height: 1.6; }
  :global(.public-page .error-border) { border-color: #dc2626; }
  :global(.public-page .field-error) { font-size: 0.8125rem; color: #dc2626; margin: 0; }
  :global(.public-page .submit-error) {
    background: #fef2f2; border: 1px solid #fca5a5; border-radius: 0.5rem; padding: 0.75rem 1rem;
    font-size: 0.875rem; color: #991b1b;
  }
</style>
