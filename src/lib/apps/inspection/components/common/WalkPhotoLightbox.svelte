<!-- src/lib/apps/inspection/components/common/WalkPhotoLightbox.svelte -->
<!-- Full-screen photo lightbox for the inspection / mobile app.
     Uses scoped styles only — no Tailwind.
     Keyboard: Esc to close, ← → to navigate. Backdrop click closes.
     props:  photos (string[]), startIndex (number, default 0)
     events: close -->
<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  export let photos     = [];   // string[] — all URLs in this set
  export let startIndex = 0;   // which photo to show first

  const dispatch = createEventDispatcher();

  let current = startIndex;

  $: total   = photos.length;
  $: canPrev = current > 0;
  $: canNext = current < total - 1;

  function prev()  { if (canPrev) current--; }
  function next()  { if (canNext) current++; }
  function close() { dispatch('close'); }

  function onKey(e) {
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  prev();
    if (e.key === 'ArrowRight') next();
  }

  onMount(() => {
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
  });
  onDestroy(() => {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="lb-backdrop" on:click|self={close}>
  <div class="lb-frame">

    <img src={photos[current]} alt="Inspection {current + 1}" class="lb-img" draggable="false" />

    <button class="lb-close" on:click={close} title="Close (Esc)">✕</button>

    {#if total > 1}
      <div class="lb-counter">{current + 1} / {total}</div>
    {/if}

    {#if canPrev}
      <button class="lb-nav lb-prev" on:click={prev} title="Previous (←)">‹</button>
    {/if}

    {#if canNext}
      <button class="lb-nav lb-next" on:click={next} title="Next (→)">›</button>
    {/if}

  </div>
</div>

<style>
  .lb-backdrop  { position:fixed; inset:0; z-index:100; background:rgba(0,0,0,0.92); display:flex; align-items:center; justify-content:center; }
  .lb-frame     { position:relative; display:flex; align-items:center; justify-content:center; width:100%; max-width:56rem; padding:0 3.5rem; }
  .lb-img       { max-width:100%; max-height:88vh; object-fit:contain; border-radius:8px; display:block; user-select:none; -webkit-user-drag:none; }
  .lb-close     { position:absolute; top:-2.75rem; right:3rem; width:2.25rem; height:2.25rem; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(0,0,0,0.7); color:#f0f0f0; border:none; cursor:pointer; font-size:0.9rem; font-weight:700; transition:background 0.15s; font-family:inherit; }
  .lb-close:hover { background:rgba(255,255,255,0.15); }
  .lb-counter   { position:absolute; bottom:-2.5rem; left:50%; transform:translateX(-50%); color:#ccc; font-size:0.7rem; background:rgba(0,0,0,0.6); padding:0.2rem 0.75rem; border-radius:999px; font-family:'DM Mono','Courier New',monospace; letter-spacing:0.08em; pointer-events:none; white-space:nowrap; }
  .lb-nav       { position:absolute; top:50%; transform:translateY(-50%); width:2.75rem; height:2.75rem; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(0,0,0,0.6); color:#f0f0f0; border:none; cursor:pointer; font-size:1.75rem; line-height:1; transition:background 0.15s; font-family:inherit; }
  .lb-nav:hover { background:rgba(255,255,255,0.15); }
  .lb-prev      { left:0; }
  .lb-next      { right:0; }
</style>
