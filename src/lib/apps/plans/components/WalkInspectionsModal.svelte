<!-- src/lib/apps/plans/components/WalkInspectionsModal.svelte -->
<!-- Browse all walk inspection sessions — filterable, expandable, portal-styled -->
<script>
  import { onMount }    from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import Modal          from '$lib/components/common/Modal.svelte';
  import Icon           from '$lib/components/icons/Icon.svelte';
  import { api }        from '$lib/utils/api';
  import { getLogger }  from '$lib/utils/logger';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';

  const logger = getLogger('WalkInspectionsModal');
  const dispatch = createEventDispatcher();

  export let show = false;

  // ── Data ──────────────────────────────────────────────────────────────────
  let sessions     = [];
  let inspections  = {};   // { [sessionId]: inspection[] }
  let loading      = true;
  let loadingId    = null; // session id currently loading inspections
  let error        = null;
  let expandedId   = null; // which session row is expanded

  // ── Filters ───────────────────────────────────────────────────────────────
  let filterBuilding = '';
  let filterType     = '';
  let filterStatus   = '';
  let filterDateFrom = '';
  let filterDateTo   = '';

  // Derived unique values for filter dropdowns
  $: buildings = [...new Set(sessions.map(s => s.building))].sort();

  // ── Filtered sessions ─────────────────────────────────────────────────────
  $: filtered = sessions.filter(s => {
    if (filterBuilding && s.building !== filterBuilding) return false;
    if (filterType     && s.element_type !== filterType)  return false;
    if (filterStatus   && s.status !== filterStatus)       return false;
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      if (new Date(s.started_at) < from) return false;
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(s.started_at) > to) return false;
    }
    return true;
  });

  // ── Summary stats on filtered set ────────────────────────────────────────
  $: totalSessions   = filtered.length;
  $: openSessions    = filtered.filter(s => s.status === 'open').length;
  $: closedSessions  = filtered.filter(s => s.status === 'closed').length;

  onMount(async () => {
    if (show) await loadSessions();
  });

  $: if (show && sessions.length === 0 && !loading) loadSessions();

  async function loadSessions() {
    loading = true;
    error   = null;
    try {
      sessions = await api.get('walk_sessions', {
        select:    '*, inspector:profiles!created_by(full_name)',
        orderBy:   'started_at',
        ascending: false
      });
      logger('✅ Loaded', sessions.length, 'sessions');
    } catch (err) {
      logger('❌ loadSessions:', err.message);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function toggleExpand(session) {
    if (expandedId === session.id) {
      expandedId = null;
      return;
    }
    expandedId = session.id;

    // Load inspections for this session if not already loaded
    if (!inspections[session.id]) {
      loadingId = session.id;
      try {
        const rows = await api.get('element_inspections', {
          filters:   { session_id: session.id },
          orderBy:   'inspected_at',
          ascending: true
        });
        inspections = { ...inspections, [session.id]: rows };
      } catch (err) {
        logger('❌ load inspections:', err.message);
        inspections = { ...inspections, [session.id]: [] };
      } finally {
        loadingId = null;
      }
    }
  }

  function clearFilters() {
    filterBuilding = '';
    filterType     = '';
    filterStatus   = '';
    filterDateFrom = '';
    filterDateTo   = '';
  }

  $: hasFilters = filterBuilding || filterType || filterStatus || filterDateFrom || filterDateTo;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function typeLabel(type) {
    return ELEMENT_TYPE_OPTIONS.find(t => t.value === type)?.label ?? type;
  }
  function typeIcon(type) {
    return ELEMENT_TYPE_OPTIONS.find(t => t.value === type)?.icon ?? '■';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function formatDateTime(iso) {
    if (!iso) return '—';
    return `${formatDate(iso)} ${formatTime(iso)}`;
  }

  function sessionDuration(s) {
    if (!s.closed_at) return null;
    const ms  = new Date(s.closed_at) - new Date(s.started_at);
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  }

  // Stats for a session's loaded inspections
  function sessionStats(sessionId) {
    const rows = inspections[sessionId] || [];
    const pass = rows.filter(r => r.result === 'pass').length;
    const fail = rows.filter(r => r.result === 'fail').length;
    const na   = rows.filter(r => r.result === 'na').length;
    // unique elements
    const elements = new Set(rows.map(r => r.element_id)).size;
    return { pass, fail, na, elements, total: rows.length };
  }

  // Group inspections by element for a session
  function groupByElement(rows) {
    const map = {};
    for (const row of rows) {
      if (!map[row.element_id]) {
        map[row.element_id] = { asset_id: row.asset_id, subtype: row.subtype, rows: [] };
      }
      map[row.element_id].rows.push(row);
    }
    // Sort: fails first, then asset_id
    return Object.values(map).sort((a, b) => {
      const aFail = a.rows.some(r => r.result === 'fail');
      const bFail = b.rows.some(r => r.result === 'fail');
      if (aFail !== bFail) return aFail ? -1 : 1;
      return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
    });
  }

  function worstResult(rows) {
    if (rows.some(r => r.result === 'fail')) return 'fail';
    if (rows.some(r => r.result === 'pass')) return 'pass';
    return 'na';
  }
</script>

<Modal {show} title="Walk Inspections" size="xlarge" on:close={() => dispatch('close')}>

  <!-- ── Filters bar ─────────────────────────────────────────────────────── -->
  <div class="flex flex-wrap gap-3 mb-5 items-end">

    <div class="flex flex-col gap-1">
      <label for="wi-building" class="text-xs text-gray-400">Building</label>
      <select id="wi-building" class="select text-sm py-1.5" bind:value={filterBuilding}>
        <option value="">All buildings</option>
        {#each buildings as b}
          <option value={b}>{b}</option>
        {/each}
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <label for="wi-type" class="text-xs text-gray-400">Type</label>
      <select id="wi-type" class="select text-sm py-1.5" bind:value={filterType}>
        <option value="">All types</option>
        {#each ELEMENT_TYPE_OPTIONS as t}
          <option value={t.value}>{t.icon} {t.label}</option>
        {/each}
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <label for="wi-status" class="text-xs text-gray-400">Status</label>
      <select id="wi-status" class="select text-sm py-1.5" bind:value={filterStatus}>
        <option value="">All</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <label for="wi-from" class="text-xs text-gray-400">From</label>
      <input id="wi-from" type="date" class="input text-sm py-1.5" bind:value={filterDateFrom} />
    </div>

    <div class="flex flex-col gap-1">
      <label for="wi-to" class="text-xs text-gray-400">To</label>
      <input id="wi-to" type="date" class="input text-sm py-1.5" bind:value={filterDateTo} />
    </div>

    {#if hasFilters}
      <button
        class="text-xs text-gray-400 hover:text-white transition-colors self-end pb-1.5"
        on:click={clearFilters}
      >
        Clear filters
      </button>
    {/if}

    <!-- Summary counts pushed to the right -->
    <div class="ml-auto flex items-center gap-4 text-sm self-end pb-1">
      <span class="text-gray-400">{totalSessions} session{totalSessions !== 1 ? 's' : ''}</span>
      {#if openSessions > 0}
        <span class="text-amber-400">{openSessions} open</span>
      {/if}
      {#if closedSessions > 0}
        <span class="text-gray-500">{closedSessions} closed</span>
      {/if}
    </div>
  </div>

  <!-- ── Content ─────────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="text-center py-12 text-gray-400">
      <p>Loading sessions…</p>
    </div>

  {:else if error}
    <div class="alert-error mb-4">{error}</div>

  {:else if filtered.length === 0}
    <div class="empty-state py-16">
      <Icon name="clipboard" size={12} className="text-gray-600 mx-auto mb-3" />
      <p class="text-gray-500">
        {hasFilters ? 'No sessions match the current filters.' : 'No walk sessions recorded yet.'}
      </p>
    </div>

  {:else}
    <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
      {#each filtered as session (session.id)}
        {@const isExpanded = expandedId === session.id}
        {@const isLoadingThis = loadingId === session.id}
        {@const stats = isExpanded && inspections[session.id] ? sessionStats(session.id) : null}

        <div class="bg-slate-700/40 border border-slate-600 rounded-lg overflow-hidden">

          <!-- ── Session row ────────────────────────────────────────────── -->
          <button
            class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-700/60 transition-colors"
            on:click={() => toggleExpand(session)}
          >
            <!-- Expand chevron -->
            <span class="text-gray-500 text-sm flex-shrink-0 w-4">
              {isExpanded ? '▾' : '▸'}
            </span>

            <!-- Type icon -->
            <span class="text-lg flex-shrink-0">{typeIcon(session.element_type)}</span>

            <!-- Main info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-white">{session.building}</span>
                <span class="text-gray-400 text-sm">Floor {session.floor_level}</span>
                <span class="text-gray-500 text-sm">·</span>
                <span class="text-gray-300 text-sm">{typeLabel(session.element_type)}</span>
              </div>
              <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                <span>{formatDateTime(session.started_at)}</span>
                {#if session.closed_at}
                  <span>→ {formatTime(session.closed_at)}</span>
                  {#if sessionDuration(session)}
                    <span class="text-gray-600">({sessionDuration(session)})</span>
                  {/if}
                {/if}
                {#if session.inspector}
                  <span class="text-gray-600">· {session.inspector.full_name}</span>
                {/if}
              </div>
            </div>

            <!-- Pass/fail quick stats (if already loaded) -->
            {#if inspections[session.id]}
              {@const s = sessionStats(session.id)}
              <div class="flex items-center gap-2 text-xs flex-shrink-0">
                {#if s.fail > 0}
                  <span class="text-red-400 font-semibold">✗ {s.fail}</span>
                {/if}
                {#if s.pass > 0}
                  <span class="text-green-400">✓ {s.pass}</span>
                {/if}
                <span class="text-gray-500">{s.elements} el.</span>
              </div>
            {/if}

            <!-- Status badge -->
            <span class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full {
              session.status === 'open'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-600/50 text-gray-400 border border-slate-600'
            }">
              {session.status}
            </span>
          </button>

          <!-- ── Expanded detail ─────────────────────────────────────────── -->
          {#if isExpanded}
            <div class="border-t border-slate-600 px-4 pb-4 pt-3 bg-slate-800/40">

              {#if isLoadingThis}
                <p class="text-gray-500 text-sm py-2">Loading inspections…</p>

              {:else if !inspections[session.id] || inspections[session.id].length === 0}
                <p class="text-gray-500 text-sm py-2 italic">No inspections recorded in this session.</p>

              {:else}
                {@const elements = groupByElement(inspections[session.id])}
                {@const s = sessionStats(session.id)}

                <!-- Stats row -->
                <div class="flex items-center gap-6 mb-3 text-sm">
                  <span class="text-gray-400">{s.elements} elements inspected</span>
                  {#if s.pass  > 0} <span class="text-green-400">✓ {s.pass} pass</span>  {/if}
                  {#if s.fail  > 0} <span class="text-red-400 font-semibold">✗ {s.fail} fail</span>   {/if}
                  {#if s.na    > 0} <span class="text-gray-500">— {s.na} n/a</span>   {/if}
                </div>

                <!-- Session notes -->
                {#if session.notes}
                  <div class="mb-3 text-sm text-gray-400 italic border-l-2 border-slate-600 pl-3">
                    "{session.notes}"
                  </div>
                {/if}

                <!-- Element results grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {#each elements as el}
                    {@const worst = worstResult(el.rows)}
                    <div class="flex items-center gap-2 px-3 py-2 rounded bg-slate-700/50 border {
                      worst === 'fail' ? 'border-red-800/60' :
                      worst === 'pass' ? 'border-green-900/60' :
                      'border-slate-600/50'
                    }">
                      <!-- Result indicator -->
                      <span class="text-sm font-bold flex-shrink-0 {
                        worst === 'pass' ? 'text-green-400' :
                        worst === 'fail' ? 'text-red-400'   :
                        'text-gray-500'
                      }">
                        {worst === 'pass' ? '✓' : worst === 'fail' ? '✗' : '—'}
                      </span>
                      <!-- Asset ID + subtype -->
                      <div class="min-w-0 flex-1">
                        <span class="text-white text-sm font-medium">{el.asset_id || '—'}</span>
                        {#if el.subtype}
                          <span class="text-gray-500 text-xs ml-1">{el.subtype}</span>
                        {/if}
                        <!-- Notes from any fail -->
                        {#each el.rows.filter(r => r.notes) as r}
                          <div class="text-xs text-gray-500 italic truncate">{r.notes}</div>
                        {/each}
                      </div>
                      <!-- Multiple inspections count -->
                      {#if el.rows.length > 1}
                        <span class="text-xs text-gray-600 flex-shrink-0">×{el.rows.length}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

        </div>
      {/each}
    </div>
  {/if}

</Modal>
