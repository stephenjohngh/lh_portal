<!-- src/lib/components/common/PhotoLightbox.svelte -->
<!-- Full-screen photo lightbox for standard (Tailwind) apps.
     Keyboard: Esc to close, ← → to navigate.
     Backdrop click closes.
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
<div
  class="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
  on:click|self={close}
>
  <div class="relative flex items-center justify-center w-full max-w-5xl px-14">

    <img
      src={photos[current]}
      alt="Inspection {current + 1}"
      class="max-w-full max-h-[88vh] object-contain rounded-lg select-none"
      draggable="false"
    />

    <!-- Close -->
    <button
      on:click={close}
      class="absolute -top-10 right-12 w-9 h-9 flex items-center justify-center rounded-full
             bg-black/70 hover:bg-black/90 text-white text-base font-bold transition-colors"
      title="Close (Esc)"
    >✕</button>

    <!-- Counter -->
    {#if total > 1}
      <div class="absolute -bottom-8 left-1/2 -translate-x-1/2
                  text-white text-xs bg-black/60 px-3 py-1 rounded-full tabular-nums pointer-events-none">
        {current + 1} / {total}
      </div>
    {/if}

    <!-- Prev -->
    {#if canPrev}
      <button
        on:click={prev}
        class="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center
               rounded-full bg-black/60 hover:bg-black/80 text-white text-3xl leading-none
               transition-colors"
        title="Previous (←)"
      >‹</button>
    {/if}

    <!-- Next -->
    {#if canNext}
      <button
        on:click={next}
        class="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center
               rounded-full bg-black/60 hover:bg-black/80 text-white text-3xl leading-none
               transition-colors"
        title="Next (→)"
      >›</button>
    {/if}

  </div>
</div>
