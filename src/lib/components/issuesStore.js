//**Purpose**: All business logic and Supabase API calls


import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';

function createIssuesStore() {
  const { subscribe, set, update } = writable({
    issues: [],
    loading: true,
    error: ''
  });

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

    async addIssue(issueData) {
      try {
        const { error } = await supabase
          .from('current_issues')
          .insert([{
            name: issueData.name,
            description: issueData.description,
            priority: parseInt(issueData.priority) || 3,
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
            priority: parseInt(issueData.priority) || 3
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


