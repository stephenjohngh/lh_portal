// src/lib/apps/issues/stores/issuesStore.js
// UPDATED: Uses general audit logging API endpoint for all events
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api } from '$lib/utils/api';
import { ISSUE_STATUS } from '$lib/utils/constants';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('issuesStore');

function createIssuesStore() {
  const { subscribe, set, update } = writable({
    issues: [],
    loading: true,
    error: ''
  });

  let realtimeChannel = null;

  // ✨ GENERAL HELPER - Log any audit event via API
  async function logAudit(eventType, targetType, targetId, targetName, data = {}) {
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger('⚠️ No user found, skipping audit log');
        return;
      }

      // Get user email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();

      const userEmail = profile?.email || user.email;

      logger('📝 Logging audit event:', { 
        eventType, 
        targetType, 
        targetId, 
        targetName,
        userId: user.id,
        userEmail 
      });
      
      const response = await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userEmail: userEmail,
          eventType,
          targetType,
          targetId,
          targetName,
          ...data
        })
      });

      const result = await response.json();
      logger('✅ Audit log response:', result);
      
      if (!response.ok) {
        logger('⚠️ Audit log failed:', result);
      }
    } catch (err) {
      logger('❌ Failed to log audit event:', err);
      // Don't fail the main operation if audit logging fails
    }
  }

  return {
    subscribe,

    async fetchIssues() {
      update(state => ({ ...state, loading: true, error: '' }));
      
      try {
        const data = await api.get('issues', {
          select: `
            *,
            issue_number,
            created_by_profile:profiles!created_by(full_name),
            updated_by_profile:profiles!updated_by(full_name),
            comments (
              id, comment_text, historic, created_at, updated_at,
              created_by_profile:profiles!created_by(full_name),
              updated_by_profile:profiles!updated_by(full_name)
            ),
            actions (
              id, action_text, name_text,  
              date_deadline, status, created_at, updated_at,
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
        { event: '*', schema: 'public', table: 'comments' },
        (payload) => {
          logger('Comment changed:', payload);
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
        
        // Create issue
        const { data: newIssue, error: createError } = await supabase
          .from('issues')
          .insert({
            name: issueData.name,
            description: issueData.description,
            priority: parseInt(issueData.priority) || 3,
            status: issueData.status || ISSUE_STATUS.CURRENT,
            created_at: now,
            updated_at: now,
            created_by: user?.id,
            updated_by: user?.id
          })
          .select('id, issue_number, name')
          .single();

        if (createError) throw createError;
        
        logger('✅ Issue created:', newIssue.id, newIssue.issue_number);

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for issue creation...');
        await logAudit(
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
        
        // Update issue
        await api.update('issues', issueId, {
          name: issueData.name,
          description: issueData.description,
          priority: parseInt(issueData.priority) || 3,
          status: issueData.status || ISSUE_STATUS.CURRENT,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        });

        logger('✅ Issue updated');

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for issue update...');
        await logAudit(
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

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for issue deletion...');
        await logAudit(
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
    // COMMENTS - With Audit Logging
    // ============================================

    async addComment(issueId, commentText) {
      try {
        logger('➕ Adding comment to issue:', issueId);
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
        
        // Create comment
        const { data: newComment, error: createError } = await supabase
          .from('comments')
          .insert({
            issue_id: issueId,
            comment_text: commentText,
            created_at: now,
            updated_at: now,
            created_by: user?.id,
            updated_by: user?.id
          })
          .select()
          .single();

        if (createError) throw createError;
        
        logger('✅ Comment created:', newComment.id);

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for comment creation...');
        await logAudit(
          'create',
          'comment',
          newComment.id,
          `Comment on Issue #${issue?.issue_number}`,
          {
            afterData: {
              comment_text: commentText,
              issue_name: issue?.name
            }
          }
        );

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        logger('❌ Error adding comment:', err);
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateComment(commentId, commentText, historic = false) {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // Get comment before update
        const { data: beforeComment } = await supabase
          .from('comments')
          .select('comment_text, historic, issue_id')
          .eq('id', commentId)
          .single();

        // Get issue for context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', beforeComment?.issue_id)
          .single();
        
        // Update comment
        await api.update('comments', commentId, {
          comment_text: commentText,
          historic: historic,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        });

        // ✨ LOG AUDIT EVENT
        await logAudit(
          'update',
          'comment',
          commentId,
          `Comment on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              comment_text: beforeComment?.comment_text,
              historic: beforeComment?.historic
            },
            afterData: {
              comment_text: commentText,
              historic: historic
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

    async deleteComment(commentId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // Get comment data before deletion
        const { data: comment } = await supabase
          .from('comments')
          .select('comment_text, historic, issue_id')
          .eq('id', commentId)
          .single();

        // Get issue for context
        const { data: issue } = await supabase
          .from('issues')
          .select('issue_number, name')
          .eq('id', comment?.issue_id)
          .single();
        
        // Delete comment
        await api.delete('comments', commentId);

        // ✨ LOG AUDIT EVENT
        await logAudit(
          'delete',
          'comment',
          commentId,
          `Comment on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              comment_text: comment?.comment_text,
              historic: comment?.historic,
              issue_name: issue?.name
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
        
        // Create action
        const { data: newAction, error: createError } = await supabase
          .from('actions')
          .insert({
            issue_id: issueId,
            action_text: actionData.action_text,
            name_text: actionData.name_text,
            date_deadline: actionData.date_deadline || null,
            status: actionData.status,
            created_at: now,
            updated_at: now,
            created_by: user?.id,
            updated_by: user?.id
          })
          .select()
          .single();

        if (createError) throw createError;
        
        logger('✅ Action created:', newAction.id);

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for action creation...');
        await logAudit(
          'create',
          'action',
          newAction.id,
          `Action on Issue #${issue?.issue_number}`,
          {
            afterData: {
              action_text: actionData.action_text,
              name_text: actionData.name_text,
              status: actionData.status,
              issue_name: issue?.name
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
        
        // Update action
        await api.update('actions', actionId, {
          action_text: actionData.action_text,
          name_text: actionData.name_text,
          date_deadline: actionData.date_deadline,
          status: actionData.status,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        });

        logger('✅ Action updated');

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for action update...');
        await logAudit(
          'update',
          'action',
          actionId,
          `Action on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              action_text: beforeAction?.action_text,
              name_text: beforeAction?.name_text,
              status: beforeAction?.status,
              date_deadline: beforeAction?.date_deadline
            },
            afterData: {
              action_text: actionData.action_text,
              name_text: actionData.name_text,
              status: actionData.status,
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

        // ✨ LOG AUDIT EVENT
        logger('📝 Calling logAudit for action deletion...');
        await logAudit(
          'delete',
          'action',
          actionId,
          `Action on Issue #${issue?.issue_number}`,
          {
            beforeData: {
              action_text: action?.action_text,
              name_text: action?.name_text,
              status: action?.status,
              date_deadline: action?.date_deadline,
              issue_name: issue?.name
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

    clearError() {
      update(state => ({ ...state, error: '' }));
    }
  };
}

export const issuesStore = createIssuesStore();
