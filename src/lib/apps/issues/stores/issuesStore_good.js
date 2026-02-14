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
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        
        await api.create('issues', {
          name: issueData.name,
          description: issueData.description,
          priority: parseInt(issueData.priority) || 3,
          status: issueData.status || ISSUE_STATUS.CURRENT,
          created_at: now,
          updated_at: now,
          created_by: user?.id,
          updated_by: user?.id
        });

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateIssue(issueId, issueData) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        await api.update('issues', issueId, {
          name: issueData.name,
          description: issueData.description,
          priority: parseInt(issueData.priority) || 3,
          status: issueData.status || ISSUE_STATUS.CURRENT,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        });

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteIssue(issueId) {
      try {
        await api.delete('issues', issueId);
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
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
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        
        await api.create('actions', {
          issue_id: issueId,
          action_text: actionData.action_text,
          name_text: actionData.name_text,
          date_deadline: actionData.date_deadline || null,
          status: actionData.status,
          created_at: now,
          updated_at: now,
          created_by: user?.id,
          updated_by: user?.id
        });

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateAction(actionId, actionData) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        await api.update('actions', actionId, {
          action_text: actionData.action_text,
          name_text: actionData.name_text,
          date_deadline: actionData.date_deadline,
          status: actionData.status,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        });

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteAction(actionId) {
      try {
        await api.delete('actions', actionId);
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
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
