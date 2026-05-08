// src/lib/apps/issues/stores/issuesStore.js
// UPDATED: comments → activities; comment_text → body; decisions merged into activities
import { get, writable }    from 'svelte/store';
import { supabase }         from '$lib/supabaseClient';
import { api }              from '$lib/utils/api';
import { ISSUE_STATUS }     from '$lib/utils/constants';
import { getLogger }        from '$lib/utils/logger';
import { logAudit }         from '$lib/utils/auditLogger';
import { currentMeeting }   from './meetingsStore';

const logger = getLogger('issuesStore');

// Local wrapper that bakes in appId: 'issues' (and a sensible default
// severity) so every audit row this store emits is filterable by app.
function audit(eventType, targetType, targetId, targetName, data = {}) {
  logAudit(eventType, targetType, targetId, targetName, {
    appId:    'issues',
    severity: eventType === 'delete' ? 'warning' : 'info',
    ...data,
  });
}

/** Read the currently-open meeting's id (or null). Used to auto-tag
 *  new issues / activities / actions during a meeting. */
function activeMeetingId() {
  return get(currentMeeting)?.id ?? null;
}

function createIssuesStore() {
  const { subscribe, set, update } = writable({
    issues: [],
    loading: true,
    error: ''
  });

  let realtimeChannel = null;

  return {
    subscribe,

    async fetchIssues() {
      update(state => ({ ...state, loading: true, error: '' }));

      try {
        const data = await api.get('issues', {
          select: `
            *,
            issue_number,
            meeting_id,
            created_by_profile:profiles!created_by(full_name),
            updated_by_profile:profiles!updated_by(full_name),
            activities (
              id, body, activity_type, historic, meeting_id, created_at, updated_at,
              created_by_profile:profiles!created_by(full_name),
              updated_by_profile:profiles!updated_by(full_name)
            ),
            actions (
              id, action_text, name_text,
              date_deadline, status, source_activity_id, meeting_id,
              created_at, updated_at,
              created_by_profile:profiles!created_by(full_name),
              updated_by_profile:profiles!updated_by(full_name)
            )
          `,
          orderBy: 'priority',
          ascending: true
        });

        const sortedData = data.sort((a, b) => {
          if (a.priority === b.priority) {
            return new Date(a.created_at) - new Date(b.created_at);
          }
          return 0;
        });

        update(state => ({
          ...state,
          issues: sortedData,
          loading: false
        }));
      } catch (err) {
        update(state => ({
          ...state,
          error: err.message,
          loading: false
        }));
      }
    },

    initializeRealtime() {
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        supabase.removeChannel(realtimeChannel);
      }

      realtimeChannel = supabase.channel('issues-changes');

      realtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'issues' },
        (payload) => {
          logger('New issue created:', payload.new);
          this.fetchIssues();
        }
      );

      realtimeChannel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'issues' },
        (payload) => {
          logger('Issue updated:', payload.new);
          this.fetchIssues();
        }
      );

      realtimeChannel.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'issues' },
        (payload) => {
          logger('Issue deleted:', payload.old);
          this.fetchIssues();
        }
      );

      realtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activities' },
        (payload) => {
          logger('Activity changed:', payload);
          this.fetchIssues();
        }
      );

      realtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actions' },
        (payload) => {
          logger('Action changed:', payload);
          this.fetchIssues();
        }
      );

      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger('✅ Real-time updates enabled for Issues Tracker');
        }
      });
    },

    cleanup() {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    },

    async addIssue(issueData) {
      try {
        logger('➕ Adding issue');
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        logger('User:', user?.id, user?.email);

        const meetingId = activeMeetingId();

        // Create issue
        const { data: newIssue, error: createError } = await supabase
          .from('issues')
          .insert({
            name: issueData.name,
            description: issueData.description,
            priority: parseInt(issueData.priority) || 3,
            status: issueData.status || ISSUE_STATUS.CURRENT,
            meeting_id: meetingId,
            created_at: now,
            updated_at: now,
            created_by: user?.id,
            updated_by: user?.id
          })
          .select('id, issue_number, name, meeting_id')
          .single();

        if (createError) throw createError;

        logger('✅ Issue created:', newIssue.id, newIssue.issue_number);

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'create',
          'issue',
          newIssue.id,
          `Issue #${newIssue.issue_number}: ${newIssue.name}`,
          {
            afterData: {
              name: issueData.name,
              description: issueData.description,
              priority: parseInt(issueData.priority) || 3,
              status: issueData.status || ISSUE_STATUS.CURRENT
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error adding issue:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateIssue(issueId, issueData) {
      try {
        logger('✏️ Updating issue:', issueId);
        const { data: { user } } = await supabase.auth.getUser();

        // Get issue before update for audit log
        const { data: beforeIssue } = await supabase
          .from('issues')
          .select('issue_number, name, description, priority, status')
          .eq('id', issueId)
          .single();

        logger('Issue before update:', beforeIssue);

        // Update issue — admin may supply override timestamps.
        const issuePayload = {
          name:        issueData.name,
          description: issueData.description,
          priority:    parseInt(issueData.priority) || 3,
          status:      issueData.status || ISSUE_STATUS.CURRENT,
          updated_at:  issueData.override_updated_at || new Date().toISOString(),
          updated_by:  user?.id
        };
        if (issueData.override_created_at) issuePayload.created_at = issueData.override_created_at;
        await api.update('issues', issueId, issuePayload);

        logger('✅ Issue updated');

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'update',
          'issue',
          issueId,
          `Issue #${beforeIssue?.issue_number}: ${issueData.name}`,
          {
            beforeData: {
              name: beforeIssue?.name,
              description: beforeIssue?.description,
              priority: beforeIssue?.priority,
              status: beforeIssue?.status
            },
            afterData: {
              name: issueData.name,
              description: issueData.description,
              priority: parseInt(issueData.priority) || 3,
              status: issueData.status || ISSUE_STATUS.CURRENT
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error updating issue:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteIssue(issueId) {
      try {
        logger('🗑️ Deleting issue:', issueId);
        const { data: { user } } = await supabase.auth.getUser();

        // Get issue data before deletion for audit log
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name, description, priority, status')
          .eq('id', issueId)
          .single();

        logger('Issue to delete:', issue);

        // Delete issue
        await api.delete('issues', issueId);

        logger('✅ Issue deleted');

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'delete',
          'issue',
          issueId,
          `Issue #${issue?.issue_number}: ${issue?.name}`,
          {
            beforeData: {
              name: issue?.name,
              description: issue?.description,
              priority: issue?.priority,
              status: issue?.status
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error deleting issue:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    // ============================================
    // ACTIVITIES - Covers comments, decisions,
    // notes, and all future typed activity types.
    // ============================================

    async addActivity(issueId, { body, activity_type = 'comment', fields = null }) {
      try {
        logger('➕ Adding activity to issue:', issueId, '(type:', activity_type, ')');
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        logger('User:', user?.id, user?.email);

        // Get issue for audit context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', issueId)
          .single();

        logger('Issue found:', issue);

        // Create activity
        const { data: newActivity, error: createError } = await supabase
          .from('activities')
          .insert({
            issue_id:      issueId,
            body,
            activity_type,
            fields:        fields || null,
            meeting_id:    activeMeetingId(),
            created_at:    now,
            updated_at:    now,
            created_by:    user?.id,
            updated_by:    user?.id
          })
          .select()
          .single();

        if (createError) throw createError;

        logger('✅ Activity created:', newActivity.id);

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'create',
          activity_type,
          newActivity.id,
          `${activity_type.charAt(0).toUpperCase() + activity_type.slice(1)} on Issue #${issue?.issue_number}`,
          {
            afterData: {
              body,
              activity_type,
              issue_name: issue?.name
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error adding activity:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateActivity(activityId, activityData) {
      try {
        const body                 = activityData.body;
        const historic             = activityData.historic ?? false;
        const fields               = activityData.fields !== undefined ? activityData.fields : null;
        const override_created_at  = activityData.override_created_at ?? null;
        const override_updated_at  = activityData.override_updated_at ?? null;

        const { data: { user } } = await supabase.auth.getUser();

        // Get activity before update
        const { data: before } = await supabase
          .from('activities')
          .select('body, historic, activity_type, issue_id')
          .eq('id', activityId)
          .single();

        // Get issue for context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', before?.issue_id)
          .single();

        // Update activity — admin may supply override timestamps.
        const payload = {
          body,
          historic,
          fields,
          updated_at: override_updated_at || new Date().toISOString(),
          updated_by: user?.id
        };
        if (override_created_at) payload.created_at = override_created_at;
        await api.update('activities', activityId, payload);

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        const aType = before?.activity_type ?? 'activity';
        audit(
          'update',
          aType,
          activityId,
          `${aType.charAt(0).toUpperCase() + aType.slice(1)} on Issue #${issue?.issue_number}`,
          {
            beforeData: { body: before?.body, historic: before?.historic },
            afterData:  { body, historic }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteActivity(activityId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // Get activity data before deletion
        const { data: activity } = await supabase
          .from('activities')
          .select('body, historic, activity_type, issue_id')
          .eq('id', activityId)
          .single();

        // Get issue for context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', activity?.issue_id)
          .single();

        // Delete activity
        await api.delete('activities', activityId);

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        const aType = activity?.activity_type ?? 'activity';
        audit(
          'delete',
          aType,
          activityId,
          `${aType.charAt(0).toUpperCase() + aType.slice(1)} on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              body:          activity?.body,
              activity_type: activity?.activity_type,
              historic:      activity?.historic,
              issue_name:    issue?.name
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    // ============================================
    // ACTIONS - Can add audit logging here too
    // ============================================

    async addAction(issueId, actionData) {
      try {
        logger('➕ Adding action to issue:', issueId);
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        logger('User:', user?.id, user?.email);

        // Get issue for audit context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', issueId)
          .single();

        logger('Issue found:', issue);

        // Create action. source_activity_id is set when this action was
        // created from an activity via the "Create Action from Comment"
        // suggestion flow; left null otherwise.
        const { data: newAction, error: createError } = await supabase
          .from('actions')
          .insert({
            issue_id:           issueId,
            action_text:        actionData.action_text,
            name_text:          actionData.name_text,
            date_deadline:      actionData.date_deadline || null,
            status:             actionData.status,
            source_activity_id: actionData.source_activity_id || null,
            meeting_id:         activeMeetingId(),
            created_at:         now,
            updated_at:         now,
            created_by:         user?.id,
            updated_by:         user?.id
          })
          .select()
          .single();

        if (createError) throw createError;

        logger('✅ Action created:', newAction.id);

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'create',
          'action',
          newAction.id,
          `Action on Issue #${issue?.issue_number}`,
          {
            afterData: {
              action_text:        actionData.action_text,
              name_text:          actionData.name_text,
              status:             actionData.status,
              source_activity_id: actionData.source_activity_id || null,
              issue_name:         issue?.name
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error adding action:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateAction(actionId, actionData) {
      try {
        logger('✏️ Updating action:', actionId);
        const { data: { user } } = await supabase.auth.getUser();

        // Get action before update for audit log
        const { data: beforeAction } = await supabase
          .from('actions')
          .select('action_text, name_text, status, date_deadline, issue_id')
          .eq('id', actionId)
          .single();

        // Get issue for context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', beforeAction?.issue_id)
          .single();

        logger('Action before update:', beforeAction);

        // Update action — admin may supply override timestamps.
        const actionPayload = {
          action_text:   actionData.action_text,
          name_text:     actionData.name_text,
          date_deadline: actionData.date_deadline,
          status:        actionData.status,
          updated_at:    actionData.override_updated_at || new Date().toISOString(),
          updated_by:    user?.id
        };
        if (actionData.override_created_at) actionPayload.created_at = actionData.override_created_at;
        await api.update('actions', actionId, actionPayload);

        logger('✅ Action updated');

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'update',
          'action',
          actionId,
          `Action on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              action_text:  beforeAction?.action_text,
              name_text:    beforeAction?.name_text,
              status:       beforeAction?.status,
              date_deadline: beforeAction?.date_deadline
            },
            afterData: {
              action_text:  actionData.action_text,
              name_text:    actionData.name_text,
              status:       actionData.status,
              date_deadline: actionData.date_deadline
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error updating action:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteAction(actionId) {
      try {
        logger('🗑️ Deleting action:', actionId);
        const { data: { user } } = await supabase.auth.getUser();

        // Get action data before deletion for audit log
        const { data: action } = await supabase
          .from('actions')
          .select('action_text, name_text, status, date_deadline, issue_id')
          .eq('id', actionId)
          .single();

        // Get issue for context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', action?.issue_id)
          .single();

        logger('Action to delete:', action);

        // Delete action
        await api.delete('actions', actionId);

        logger('✅ Action deleted');

        // ✨ LOG AUDIT EVENT (fire-and-forget)
        audit(
          'delete',
          'action',
          actionId,
          `Action on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              action_text:  action?.action_text,
              name_text:    action?.name_text,
              status:       action?.status,
              date_deadline: action?.date_deadline,
              issue_name:   issue?.name
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error deleting action:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    // Batch-assign existing issues / activities / actions to a meeting.
    // Used by the admin "Assign existing items" migration tool.
    async assignToMeeting(meetingId, { issueIds = [], activityIds = [], actionIds = [] }) {
      try {
        const total = issueIds.length + activityIds.length + actionIds.length;
        if (total === 0) return { success: true };

        logger(`📎 Assigning ${total} items to meeting ${meetingId}`);
        const { data: { user } } = await supabase.auth.getUser();
        const now = new Date().toISOString();

        const tasks = [];
        if (issueIds.length > 0) {
          tasks.push(
            supabase.from('issues')
              .update({ meeting_id: meetingId, updated_by: user?.id, updated_at: now })
              .in('id', issueIds)
          );
        }
        if (activityIds.length > 0) {
          tasks.push(
            supabase.from('activities')
              .update({ meeting_id: meetingId, updated_by: user?.id, updated_at: now })
              .in('id', activityIds)
          );
        }
        if (actionIds.length > 0) {
          tasks.push(
            supabase.from('actions')
              .update({ meeting_id: meetingId, updated_by: user?.id, updated_at: now })
              .in('id', actionIds)
          );
        }

        const results = await Promise.all(tasks);
        for (const { error: err } of results) {
          if (err) throw err;
        }

        logger(`✅ Assigned ${total} items`);
        audit('update', 'meeting', meetingId, `Assigned ${total} item(s) to meeting`, {
          afterData: { issueIds, activityIds, actionIds }
        });

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error assigning to meeting:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    clearError() {
      update(state => ({ ...state, error: '' }));
    }
  };
}

export const issuesStore = createIssuesStore();
