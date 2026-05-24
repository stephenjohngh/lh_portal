// src/lib/apps/management/stores/meetingsStore.js
//
// Owns the "team progress meeting" state used by the Issues app. When
// a meeting is open, every new issue/comment/action is auto-tagged
// with that meeting's id (the stamping happens in issuesStore at write
// time — this store just exposes which meeting is current).
//
// Public surface:
//   - `meetingsStore`        — readable store: { list, current, loaded, error }
//   - `meetingsStore.load()`         — fetch all meetings (with item counts)
//   - `meetingsStore.create(data)`   — create a meeting; returns { success, meeting?, error? }
//   - `meetingsStore.updateMeeting(id, patch)`
//   - `meetingsStore.open(id)`       — flip status='open' (DB enforces single-open)
//   - `meetingsStore.close(id)`      — flip status='closed', stamp closed_at
//   - `meetingsStore.reopen(id)`     — UI restricts to "latest closed only"; this just re-opens
//   - `meetingsStore.delete(id)`     — admin only (RLS enforces)
//   - `meetingsStore.untagItem(table, id)` — set meeting_id=null on one row
//
// All mutations write an audit_logs row with appId='management',
// eventCategory='meetings'.
//
// Item counts (issues/comments/actions tagged to each meeting) come
// from ManagementApp's existing fetched data — we don't query
// for them here, we recompute reactively in the UI from $issuesStore.

import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api }      from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('meetingsStore');

// Shared audit wrapper that bakes in app/category. Same pattern as
// issuesStore's local `audit()` helper.
function audit(eventType, targetType, targetId, targetName, data = {}) {
  logAudit(eventType, targetType, targetId, targetName, {
    appId:         'management',
    eventCategory: 'meetings',
    severity:      eventType === 'delete' ? 'warning' : 'info',
    ...data
  });
}

function createMeetingsStore() {
  const _state = writable({
    list:    [],     // newest-first
    current: null,   // the single open meeting, or null
    loaded:  false,
    error:   null
  });

  let realtimeChannel = null;

  /** Refresh the list and re-derive `current`. */
  async function load() {
    try {
      const list = await api.get('meetings', {
        select:    '*',
        orderBy:   'meeting_date',
        ascending: false
      });
      // Stable secondary sort: created_at desc when dates tie.
      list.sort((a, b) => {
        if (a.meeting_date !== b.meeting_date) {
          return new Date(b.meeting_date) - new Date(a.meeting_date);
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });

      const current = list.find(m => m.status === 'open') ?? null;
      _state.set({ list, current, loaded: true, error: null });
      logger('✅ Loaded', list.length, 'meetings;', current ? `open: ${current.title}` : 'none open');
      return list;
    } catch (err) {
      logger('❌ Failed to load meetings:', err.message);
      _state.update(s => ({ ...s, loaded: true, error: err.message }));
      return [];
    }
  }

  // -- Realtime: any change to the meetings table → reload ---------
  function initializeRealtime() {
    if (realtimeChannel) return;
    realtimeChannel = supabase
      .channel('meetings-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meetings' },
        () => load()
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') logger('✅ Realtime subscribed for meetings');
      });
  }

  function cleanup() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  // -- Mutations ----------------------------------------------------

  async function create(data) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      const row = await api.create('meetings', {
        title:        data.title,
        meeting_type: data.meeting_type || 'team_progress',
        meeting_date: data.meeting_date,
        notes:        data.notes ?? null,
        participants: data.participants ?? { profile_ids: [], extras: [] },
        status:       data.openImmediately ? 'open' : 'closed',
        opened_at:    data.openImmediately ? new Date().toISOString() : null,
        closed_at:    data.openImmediately ? null : new Date().toISOString(),
        created_by:   userId,
        updated_by:   userId
      }, true);

      audit('create', 'meeting', row.id, row.title, {
        afterData: { meeting_type: row.meeting_type, meeting_date: row.meeting_date, status: row.status }
      });

      await load();
      return { success: true, meeting: row };
    } catch (err) {
      logger('❌ create failed:', err.message);
      // Friendly message for the partial-unique-index conflict
      const msg = /meetings_one_open/.test(err.message)
        ? 'Another meeting is already open. Close it before opening a new one.'
        : err.message;
      return { success: false, error: msg };
    }
  }

  async function update(id, patch) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      const before = await api.getById('meetings', id);

      // Allow-list of writable columns. UI-only fields from MeetingForm
      // (openImmediately, etc.) are silently dropped here so they can
      // never leak into the SQL UPDATE — PostgREST rejects unknown
      // columns with "Could not find the '<col>' column ... in the
      // schema cache".
      const writable = {};
      for (const k of ['title', 'meeting_type', 'meeting_date', 'notes', 'participants']) {
        if (k in patch) writable[k] = patch[k];
      }
      writable.updated_by = userId;

      const row = await api.update('meetings', id, writable, true);

      audit('update', 'meeting', id, row.title, {
        beforeData: before,
        afterData:  row
      });

      await load();
      return { success: true, meeting: row };
    } catch (err) {
      logger('❌ update failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async function open(id) {
    try {
      const row = await api.update('meetings', id, {
        status:    'open',
        opened_at: new Date().toISOString(),
        closed_at: null
      }, true);
      audit('update', 'meeting', id, row.title, {
        eventAction: 'open_meeting',
        afterData:   { status: 'open' }
      });
      await load();
      return { success: true };
    } catch (err) {
      logger('❌ open failed:', err.message);
      const msg = /meetings_one_open/.test(err.message)
        ? 'Another meeting is already open. Close it first.'
        : err.message;
      return { success: false, error: msg };
    }
  }

  async function close(id) {
    try {
      const row = await api.update('meetings', id, {
        status:    'closed',
        closed_at: new Date().toISOString()
      }, true);
      audit('update', 'meeting', id, row.title, {
        eventAction: 'close_meeting',
        afterData:   { status: 'closed' }
      });
      await load();
      return { success: true };
    } catch (err) {
      logger('❌ close failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /** UI restricts to "latest closed"; the DB allows reopening any
   *  closed meeting, so an admin can SQL-fix in extremis. */
  async function reopen(id) {
    return open(id);
  }

  async function remove(id) {
    try {
      const before = await api.getById('meetings', id);
      await api.delete('meetings', id);
      audit('delete', 'meeting', id, before?.title ?? '(unknown)', {
        beforeData: before
      });
      await load();
      return { success: true };
    } catch (err) {
      logger('❌ delete failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Clear meeting_id on one item ("untag from this meeting").
   * @param {'issues'|'activities'|'actions'} table
   * @param {string} rowId
   */
  async function untagItem(table, rowId) {
    if (!['issues', 'activities', 'actions'].includes(table)) {
      return { success: false, error: `Unsupported table: ${table}` };
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      await api.update(table, rowId, {
        meeting_id: null,
        updated_by: userId
      });
      const targetType = { issues: 'issue', activities: 'activity', actions: 'action' }[table] ?? table;
      audit('update', targetType, rowId, '(untagged)', {
        eventAction: 'untag_meeting'
      });
      return { success: true };
    } catch (err) {
      logger('❌ untag failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  return {
    subscribe: _state.subscribe,
    load,
    initializeRealtime,
    cleanup,
    create,
    updateMeeting: update,
    open,
    close,
    reopen,
    delete: remove,
    untagItem
  };
}

export const meetingsStore = createMeetingsStore();

// Convenience: a tiny derived store that exposes just the open meeting
// (or null). Components that only need to know "is a meeting active?"
// can subscribe to this without seeing the whole list.
export const currentMeeting = derived(meetingsStore, $s => $s.current);
