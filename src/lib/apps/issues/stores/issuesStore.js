// src/lib/apps/issues/stores/issuesStore.js
// REFACTORED: Now uses API client for cleaner code
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api } from '$lib/utils/api';
import { ISSUE_STATUS } from '$lib/utils/constants';

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
        // ✨ REFACTORED: Using API client instead of direct supabase
        const data = await api.get('issues', {
          select: `
            *,
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

        // Apply secondary sort by created_at
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
      // Clean up existing channel if any
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }

      // Create a channel for real-time updates
      realtimeChannel = supabase.channel('issues-changes');

      // Listen for INSERT on issues
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'issues'
        },
        (payload) => {
          console.log('New issue created:', payload.new);
          // Refetch to get the complete data with relations
          this.fetchIssues();
        }
      );

      // Listen for UPDATE on issues
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'issues'
        },
        (payload) => {
          console.log('Issue updated:', payload.new);
          this.fetchIssues();
        }
      );

      // Listen for DELETE on issues
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'issues'
        },
        (payload) => {
          console.log('Issue deleted:', payload.old);
          this.fetchIssues();
        }
      );

      // Listen for changes on comments
      realtimeChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments'
        },
        (payload) => {
          console.log('Comment changed:', payload);
          this.fetchIssues();
        }
      );

      // Listen for changes on actions
      realtimeChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'actions'
        },
        (payload) => {
          console.log('Action changed:', payload);
          this.fetchIssues();
        }
      );

      // Subscribe to start receiving events
      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time updates enabled for Issues Tracker');
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
        
        // ✨ REFACTORED: Using API client
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
        
        // ✨ REFACTORED: Using API client
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
        // ✨ REFACTORED: Using API client
        await api.delete('issues', issueId);

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async addComment(issueId, commentText) {
      try {
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        
        // ✨ REFACTORED: Using API client
        await api.create('comments', {
          issue_id: issueId,
          comment_text: commentText,
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

    async updateComment(commentId, commentText, historic = false) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        // ✨ REFACTORED: Using API client
        await api.update('comments', commentId, {
          comment_text: commentText,
          historic: historic,
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

    async deleteComment(commentId) {
      try {
        // ✨ REFACTORED: Using API client
        await api.delete('comments', commentId);

        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async addAction(issueId, actionData) {
      try {
        const now = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        
        // ✨ REFACTORED: Using API client
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
        
        // ✨ REFACTORED: Using API client
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
        // ✨ REFACTORED: Using API client
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
