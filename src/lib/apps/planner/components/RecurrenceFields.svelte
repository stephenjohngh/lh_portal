<!-- src/lib/apps/planner/components/RecurrenceFields.svelte -->
<!-- How a series repeats.

     The rule is built by choosing, never by typing: a recurrence somebody has
     to spell correctly is one they will get wrong, and a wrong rule is
     invisible until the year is wrong. Whatever is chosen is echoed back in
     words underneath (describeRule), so it can be checked before it is saved. -->
<script>
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import FormInput  from '$lib/components/common/FormInput.svelte';
  import Checkbox   from '$lib/components/common/Checkbox.svelte';
  import { describeRule, ordinal, PRESETS, presetOf, applyPreset } from '../utils/recurrence.js';

  /** The rule object, bound by the parent form. */
  export let rule = { freq: 'once' };
  /** Whether the series counts from the last completion. */
  export let drifts = false;

  /**
   * What the dropdown offers.
   *
   * Quarterly and twice-a-year sit alongside the four real frequencies even
   * though they are monthly underneath — because that is how people say them,
   * and "Monthly, every 3" is a puzzle rather than a choice.
   */
  const FREQ = [
    { value: 'once',      label: 'Does not repeat' },
    { value: 'daily',     label: 'Daily' },
    { value: 'weekly',    label: 'Weekly' },
    { value: 'monthly',   label: 'Monthly' },
    ...PRESETS.map(p => ({ value: p.key, label: p.label })),
    { value: 'yearly',    label: 'Yearly' },
  ];

  /**
   * The dropdown's value is DERIVED from the rule, never held beside it.
   *
   * Choose Quarterly, then change the interval to 4, and it must stop calling
   * itself quarterly — which it cannot do if the choice is remembered
   * separately from the thing it described.
   */
  $: choice = presetOf(rule) ?? rule.freq;

  function chooseFreq(value) {
    if (PRESETS.some(p => p.key === value)) rule = applyPreset(rule, value);
    else rule = { ...rule, freq: value, interval: 1 };
  }

  const WEEKDAYS = [
    { value: 0, short: 'Sun' }, { value: 1, short: 'Mon' }, { value: 2, short: 'Tue' },
    { value: 3, short: 'Wed' }, { value: 4, short: 'Thu' }, { value: 5, short: 'Fri' },
    { value: 6, short: 'Sat' },
  ];

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']
    .map((label, i) => ({ value: i + 1, label }));

  const NTH = [
    { value: 1, label: 'first' }, { value: 2, label: 'second' }, { value: 3, label: 'third' },
    { value: 4, label: 'fourth' }, { value: -1, label: 'last' },
  ];

  /** Day-of-month choices, plus the end of the month however long it is. */
  const MONTH_DAYS = [
    ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) })),
    { value: -1, label: 'last day' },
  ];

  $: repeats = rule.freq && rule.freq !== 'once';
  $: monthly = rule.freq === 'monthly' || rule.freq === 'yearly';

  /** Monthly can be "on the 14th" or "on the first Tuesday". */
  $: byWeekday = !!rule.nth;

  function setMode(useWeekday) {
    rule = useWeekday
      ? { ...rule, nth: rule.nth ?? 1, weekday: rule.weekday ?? 1, monthDay: undefined }
      : { ...rule, nth: undefined, weekday: undefined, monthDay: rule.monthDay ?? 1 };
  }

  function toggleWeekday(day) {
    const days = new Set(rule.weekdays ?? []);
    if (days.has(day)) days.delete(day); else days.add(day);
    rule = { ...rule, weekdays: [...days].sort((a, b) => a - b) };
  }
</script>

<div class="space-y-2">
  <!-- FormSelect forwards the NATIVE change event, so the value comes off the
       target. Not `e.detail ?? e.target.value`: a native event's `detail` is a
       number, and `0 ?? x` is 0 — which would have been passed straight through
       as the chosen frequency. -->
  <FormSelect label="Repeats" value={choice} options={FREQ}
              on:change={(e) => chooseFreq(e.target.value)} />

  <!-- The interval is hidden for a preset: it is the preset. Showing "Every 3
       months" beneath the word "Quarterly" invites somebody to change one and
       wonder why the other disagrees. -->
  {#if repeats && !presetOf(rule)}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <FormInput label="Every" type="number" bind:value={rule.interval}
                 placeholder="1" min="1" />
      <div class="flex items-end pb-2 text-xs text-slate-500">
        {rule.freq === 'daily' ? 'days' : rule.freq === 'weekly' ? 'weeks'
          : rule.freq === 'monthly' ? 'months' : 'years'}
      </div>
    </div>
  {/if}

  {#if rule.freq === 'weekly'}
    <div>
      <p class="text-xs text-slate-400 mb-1.5">On these days</p>
      <div class="flex flex-wrap gap-1">
        {#each WEEKDAYS as day}
          <button type="button"
                  class="px-2 py-1 rounded text-xs border transition-colors
                         {rule.weekdays?.includes(day.value)
                           ? 'bg-purple-600 border-purple-500 text-white'
                           : 'border-slate-600 text-slate-400 hover:border-slate-500'}"
                  on:click={() => toggleWeekday(day.value)}>{day.short}</button>
        {/each}
      </div>
      <p class="text-[11px] text-slate-600 mt-1">
        Choose none and it follows the start date.
      </p>
    </div>
  {/if}

  {#if monthly && !drifts}
    {#if rule.freq === 'yearly'}
      <FormSelect label="In" bind:value={rule.month} options={MONTHS} />
    {/if}

    <div class="flex items-center gap-3 text-xs">
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" checked={!byWeekday} on:change={() => setMode(false)}
               class="accent-purple-500" />
        <span class="text-slate-400">On a date</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" checked={byWeekday} on:change={() => setMode(true)}
               class="accent-purple-500" />
        <span class="text-slate-400">On a weekday</span>
      </label>
    </div>

    {#if byWeekday}
      <div class="grid grid-cols-2 gap-3">
        <FormSelect label="The" bind:value={rule.nth} options={NTH} />
        <FormSelect label="Weekday" bind:value={rule.weekday}
                    options={WEEKDAYS.map(d => ({ value: d.value, label: d.short }))} />
      </div>
    {:else}
      <FormSelect label="On the" bind:value={rule.monthDay} options={MONTH_DAYS} />
    {/if}
  {/if}

  {#if repeats}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <FormInput label="Until (optional)" type="date" bind:value={rule.until} />
      <FormInput label="Or after this many times" type="number" bind:value={rule.count}
                 placeholder="unlimited" min="1" />
    </div>

    <!-- The decision nobody would guess from a date. Worded as the question it
         actually is, rather than as the word "anchored". -->
    <label class="flex items-start gap-2 cursor-pointer p-2 rounded border
                  border-slate-700 bg-slate-800/40">
      <input type="checkbox" bind:checked={drifts} class="mt-0.5 accent-purple-500" />
      <span class="text-xs text-slate-400">
        Count from when it was last done
        <span class="block text-[11px] text-slate-500">
          A boiler serviced every twelve months, whenever that was. Off for
          anything fixed to the calendar, like the AGM.
        </span>
      </span>
    </label>

    {#if drifts && monthly}
      <p class="text-[11px] text-amber-500/80">
        Only the interval applies while this is on — a fixed month would
        contradict it.
      </p>
    {/if}
  {/if}

  <!-- Echoed back so a wrong rule can be seen before it is saved. -->
  <p class="text-xs text-purple-300 bg-purple-500/5 border border-purple-500/20
            rounded px-2 py-1.5">
    {describeRule(rule, { drifts })}
  </p>
</div>
