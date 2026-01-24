// src/lib/components/issues/issuesStore.js
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
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
        const { data, error } = await supabase
          .from('current_issues')
          .select(`
            *,
            comments (
              id, comment_text, date, created_at
            ),
            actions (
              id, action_text, name_text, date_added, 
              date_deadline, status, created_at
            )
          `)
          .order('priority', { ascending: true })
          .order('original_date', { ascending: true });

        if (error) throw error;
        
        update(state => ({ 
          ...state, 
          issues: data || [], 
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

      // Listen for INSERT on current_issues
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'current_issues'
        },
        (payload) => {
          console.log('New issue created:', payload.new);
          // Refetch to get the complete data with relations
          this.fetchIssues();
        }
      );

      // Listen for UPDATE on current_issues
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'current_issues'
        },
        (payload) => {
          console.log('Issue updated:', payload.new);
          this.fetchIssues();
        }
      );

      // Listen for DELETE on current_issues
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'current_issues'
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
        const { error } = await supabase
          .from('current_issues')
          .insert([{
            name: issueData.name,
            description: issueData.description,
            priority: parseInt(issueData.priority) || 3,
            status: issueData.status || ISSUE_STATUS.CURRENT,
            original_date: new Date().toISOString()
          }]);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateIssue(issueId, issueData) {
      try {
        const { error } = await supabase
          .from('current_issues')
          .update({
            name: issueData.name,
            description: issueData.description,
            priority: parseInt(issueData.priority) || 3,
            status: issueData.status || ISSUE_STATUS.CURRENT
          })
          .eq('id', issueId);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteIssue(issueId) {
      try {
        const { error } = await supabase
          .from('current_issues')
          .delete()
          .eq('id', issueId);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async addComment(issueId, commentText) {
      try {
        const { error } = await supabase
          .from('comments')
          .insert([{
            issue_id: issueId,
            comment_text: commentText,
            date: new Date().toISOString()
          }]);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateComment(commentId, commentText) {
      try {
        const { error } = await supabase
          .from('comments')
          .update({ comment_text: commentText })
          .eq('id', commentId);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteComment(commentId) {
      try {
        const { error } = await supabase
          .from('comments')
          .delete()
          .eq('id', commentId);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async addAction(issueId, actionData) {
      try {
        const { error } = await supabase
          .from('actions')
          .insert([{
            issue_id: issueId,
            action_text: actionData.action_text,
            name_text: actionData.name_text,
            date_added: new Date().toISOString(),
            date_deadline: actionData.date_deadline || null,
            status: actionData.status
          }]);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async updateAction(actionId, actionData) {
      try {
        const { error } = await supabase
          .from('actions')
          .update({
            action_text: actionData.action_text,
            name_text: actionData.name_text,
            date_deadline: actionData.date_deadline,
            status: actionData.status
          })
          .eq('id', actionId);

        if (error) throw error;
        await this.fetchIssues();
        return { success: true };
      } catch (err) {
        update(state => ({ ...state, error: err.message }));
        return { success: false, error: err.message };
      }
    },

    async deleteAction(actionId) {
      try {
        const { error } = await supabase
          .from('actions')
          .delete()
          .eq('id', actionId);

        if (error) throw error;
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
