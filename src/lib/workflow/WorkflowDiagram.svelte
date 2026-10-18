<!-- src/lib/workflow/WorkflowDiagram.svelte -->
<!-- A workflow drawn (2026-10-17): its steps as boxes coloured by kind, its
     moves as arrows labelled with their buttons, and — when `stats` is given
     (workflowStats.js) — how it is being used: how many are in each step now,
     how many of those are overdue, the median days spent there, how often each
     move has been made, and moves made that the workflow no longer allows.
     Any app's workflow can be drawn with it: the point of one standard model.
     Plain SVG, laid out by workflowLayout.js; no graph library. -->
<script>
  import { layoutWorkflow } from './workflowLayout.js';
  import { describeDeadline } from './workflowDeadlines.js';
  import { ACCENT } from '#lib/theme.js';

  /** @type {Array<{ key: string, name: string, kind: string, position?: number, deadline_days?: number|string|null, deadline_basis?: string, deadline_from?: string }>} */
  export let steps = [];
  /** @type {Array<{ from_key: string, to_key: string, label: string, note_required?: boolean, admin_only?: boolean, action?: string|null, who?: string, four_eyes?: boolean }>} */
  export let moves = [];
  /** @type {ReturnType<typeof import('./workflowStats.js').workflowStats> | null} */
  export let stats = null;
  export let title = 'Workflow diagram';

  $: layout = layoutWorkflow(steps, moves);
  $: stepOf = new Map(steps.map((s) => [s.key, s]));
  $: maxMoves = Math.max(1, ...Object.values(stats?.moveCount ?? {}));
  $: offPath = Object.entries(stats?.offPath ?? {});

  const FILL = { start: '#134e4a', open: '#1e293b', done: '#14532d', declined: '#4c1d1d' };
  const STROKE = { start: ACCENT, open: '#64748b', done: '#22c55e', declined: '#ef4444' };
  const fmtDays = (/** @type {number|null} */ d) => (d == null ? '' : `${Number.isInteger(d) ? d : d.toFixed(1)} d`);
</script>

<div class="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/60 p-2" data-testid="workflow-diagram">
  <svg role="img" aria-label={title} width={layout.width} height={layout.height} viewBox="0 0 {layout.width} {layout.height}" class="block">
    <defs>
      <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
      </marker>
    </defs>

    {#each layout.edges as e (e.from + '>' + e.to)}
      {@const used = stats?.moveCount?.[`${e.from}>${e.to}`] ?? 0}
      {@const mv = moves.find((m) => m.from_key === e.from && m.to_key === e.to)}
      <path d={e.path} fill="none" stroke={e.back ? '#64748b' : '#94a3b8'} stroke-dasharray={e.back ? '5 4' : ''}
        stroke-width={stats ? 1.2 + (3 * used) / maxMoves : 1.5} marker-end="url(#wf-arrow)">
        <title>{e.label}{mv?.note_required ? ' — needs a note' : ''}{mv?.admin_only ? ' — admin only' : ''}{mv?.who === 'assignee' ? ' — only the person it is with' : ''}{mv?.four_eyes ? ' — four-eyes: not the person who made the last move' : ''}{mv?.action ? ' — runs an action' : ''}{mv?.timer_days ? ` — by itself after ${mv.timer_days} ${mv.timer_basis === 'working' ? 'working ' : ''}days` : ''}{stats ? ` — made ${used} time${used === 1 ? '' : 's'}` : ''}</title>
      </path>
      <text x={e.labelX} y={e.labelY} text-anchor="middle" font-size="10" fill="#cbd5e1" class="select-none"
        stroke="#0f172a" stroke-width="3" paint-order="stroke">
        {e.label}{mv?.note_required ? ' ✎' : ''}{mv?.admin_only ? ' 🔒' : ''}{mv?.who === 'assignee' ? ' 👤' : ''}{mv?.four_eyes ? ' 👥' : ''}{mv?.action ? ' ⚙' : ''}{mv?.timer_days ? ' ⏲' : ''}{stats && used ? ` (${used})` : ''}
      </text>
    {/each}

    {#each layout.nodes as n (n.key)}
      {@const s = stepOf.get(n.key)}
      {@const st = stats?.step?.[n.key]}
      <g data-testid="workflow-diagram-step">
        <title>{s?.name}{s?.deadline_days ? ` — ${describeDeadline({ ...s, deadline_days: Number(s.deadline_days) })}` : ''}{st ? ` — ${st.now} here now, ${st.ever} ever${st.medianDays != null ? `, median ${fmtDays(st.medianDays)} here` : ''}` : ''}</title>
        <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="8" fill={FILL[s?.kind ?? 'open']} stroke={STROKE[s?.kind ?? 'open']} stroke-width="1.5" />
        <text x={n.x + n.w / 2} y={n.y + (st ? 18 : 27)} text-anchor="middle" font-size="12" fill="#f1f5f9" class="select-none">{s?.name}{s?.deadline_days ? ' ⏱' : ''}</text>
        {#if st}
          <text x={n.x + n.w / 2} y={n.y + 35} text-anchor="middle" font-size="10" fill="#94a3b8" class="select-none">
            {st.now} now{st.medianDays != null ? ` · ${fmtDays(st.medianDays)}` : ''}
          </text>
          {#if st.overdue}
            <circle cx={n.x + n.w - 6} cy={n.y + 6} r="10" fill="#dc2626" />
            <text x={n.x + n.w - 6} y={n.y + 10} text-anchor="middle" font-size="11" font-weight="bold" fill="#fff" class="select-none">{st.overdue}</text>
          {/if}
        {/if}
      </g>
    {/each}
  </svg>
  <p class="mt-1 text-xs text-slate-500">
    Teal: start · grey: in progress · green: accepted · red: not accepted · dashed: a move back · ✎ needs a note · 🔒 admin only · 👤 only the person it is with · 👥 four-eyes · ⚙ runs an action · ⏲ made by itself after a time · ⏱ has a deadline{stats ? ' · thicker arrow: used more · red badge: overdue · “d”: median days spent there' : ''}
  </p>
  {#if offPath.length}
    <p class="mt-1 text-xs text-amber-300" data-testid="workflow-diagram-offpath">
      Moves made that the workflow no longer allows: {offPath.map(([k, n]) => `${k.replace('>', ' → ')} (${n})`).join(', ')}.
    </p>
  {/if}
</div>
