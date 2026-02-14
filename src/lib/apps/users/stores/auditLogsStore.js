// src/lib/apps/users/stores/auditLogsStore.js
// Client-side store for audit logs
// Fetches, filters, and manages audit log data

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('auditLogsStore');

function createAuditLogsStore() {
  const { subscribe, set, update } = writable({
    logs: [],
    loading: false,
    error: null,
    totalCount: 0,
    hasMore: false,
    currentFilters: null
  });

  return {
    subscribe,

    /**
     * Fetch audit logs with filters
     */
    async fetchLogs(filters = {}) {
      logger('Fetching audit logs with filters:', filters);
      update(state => ({ ...state, loading: true, error: null, currentFilters: filters }));

      try {
        const {
          userId,
          eventType,
          eventCategory,
          severity,
          startDate,
          endDate,
          search,
          flaggedOnly = false,
          limit = 100,
          offset = 0
        } = filters;

        let query = supabase
          .from('audit_logs')
          .select('*', { count: 'exact' });

        // Apply filters
        if (userId) {
          query = query.eq('user_id', userId);
        }
        if (eventType) {
          query = query.eq('event_type', eventType);
        }
        if (eventCategory) {
          query = query.eq('event_category', eventCategory);
        }
        if (severity) {
          query = query.eq('severity', severity);
        }
        if (startDate) {
          // Add start of day time (00:00:00)
          query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
        }
        if (endDate) {
          // Add end of day time (23:59:59.999)
          query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
        }
        if (search) {
          query = query.or(`user_email.ilike.%${search}%,target_name.ilike.%${search}%`);
        }
        if (flaggedOnly) {
          query = query.eq('flagged', true);
        }

        // Order and paginate
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        logger('Fetched', data?.length || 0, 'logs, total count:', count);

        update(state => ({
          ...state,
          logs: offset === 0 ? data : [...state.logs, ...data],
          loading: false,
          totalCount: count || 0,
          hasMore: (offset + limit) < (count || 0)
        }));

      } catch (err) {
        logger('Error fetching logs:', err);
        update(state => ({
          ...state,
          loading: false,
          error: err.message || 'Failed to fetch audit logs'
        }));
      }
    },

    /**
     * Load more logs (pagination)
     */
    async loadMore() {
      let currentState;
      update(state => {
        currentState = state;
        return state;
      });

      if (!currentState.hasMore || currentState.loading) {
        return;
      }

      const filters = {
        ...currentState.currentFilters,
        offset: currentState.logs.length
      };

      await this.fetchLogs(filters);
    },

    /**
     * Get logs for specific user
     */
    async getUserLogs(userId, limit = 50) {
      return this.fetchLogs({ userId, limit });
    },

    /**
     * Get recent critical events
     */
    async getCriticalEvents(limit = 20) {
      return this.fetchLogs({ severity: 'critical', limit });
    },

    /**
     * Get flagged events
     */
    async getFlaggedEvents(limit = 50) {
      return this.fetchLogs({ flaggedOnly: true, limit });
    },

    /**
     * Get security events (auth + critical)
     */
    async getSecurityEvents(limit = 50) {
      return this.fetchLogs({ eventCategory: 'auth', limit });
    },

    /**
     * Get logs for specific date range
     */
    async getLogsForDateRange(startDate, endDate, limit = 100) {
      return this.fetchLogs({ startDate, endDate, limit });
    },

    /**
     * Export logs to CSV
     */
    async exportToCSV(filters = {}) {
      logger('Exporting logs to CSV...');

      try {
        // Fetch all logs matching filters (no pagination)
        let query = supabase
          .from('audit_logs')
          .select('*');

        // Apply filters
        if (filters.userId) query = query.eq('user_id', filters.userId);
        if (filters.eventType) query = query.eq('event_type', filters.eventType);
        if (filters.eventCategory) query = query.eq('event_category', filters.eventCategory);
        if (filters.severity) query = query.eq('severity', filters.severity);
        if (filters.startDate) query = query.gte('created_at', `${filters.startDate}T00:00:00.000Z`);
        if (filters.endDate) query = query.lte('created_at', `${filters.endDate}T23:59:59.999Z`);
        if (filters.flaggedOnly) query = query.eq('flagged', true);

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
          throw new Error('No logs to export');
        }

        // Convert to CSV
        const headers = [
          'Timestamp',
          'User Email',
          'User ID',
          'Event Type',
          'Event Category',
          'Event Action',
          'Target Type',
          'Target ID',
          'Target Name',
          'Severity',
          'Flagged',
          'IP Address',
          'User Agent'
        ];

        const rows = data.map(log => [
          new Date(log.created_at).toISOString(),
          log.user_email || '',
          log.user_id || '',
          log.event_type || '',
          log.event_category || '',
          log.event_action || '',
          log.target_type || '',
          log.target_id || '',
          log.target_name || '',
          log.severity || '',
          log.flagged ? 'Yes' : 'No',
          log.user_ip_address || '',
          log.user_agent || ''
        ]);

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        logger('CSV export complete:', data.length, 'logs');
        return { success: true, count: data.length };

      } catch (err) {
        logger('Error exporting CSV:', err);
        throw new Error(err.message || 'Failed to export audit logs');
      }
    },

    /**
     * Flag an audit log entry
     */
    async flagLog(logId, reason) {
      logger('Flagging log:', logId);

      try {
        const { error } = await supabase
          .from('audit_logs')
          .update({
            flagged: true,
            metadata: {
              flag_reason: reason,
              flagged_at: new Date().toISOString()
            }
          })
          .eq('id', logId);

        if (error) throw error;

        // Update in store
        update(state => ({
          ...state,
          logs: state.logs.map(log =>
            log.id === logId
              ? { ...log, flagged: true, metadata: { ...log.metadata, flag_reason: reason } }
              : log
          )
        }));

        logger('Log flagged successfully');
        return { success: true };

      } catch (err) {
        logger('Error flagging log:', err);
        throw new Error(err.message || 'Failed to flag audit log');
      }
    },

    /**
     * Unflag an audit log entry
     */
    async unflagLog(logId) {
      logger('Unflagging log:', logId);

      try {
        const { error } = await supabase
          .from('audit_logs')
          .update({ flagged: false })
          .eq('id', logId);

        if (error) throw error;

        // Update in store
        update(state => ({
          ...state,
          logs: state.logs.map(log =>
            log.id === logId ? { ...log, flagged: false } : log
          )
        }));

        logger('Log unflagged successfully');
        return { success: true };

      } catch (err) {
        logger('Error unflagging log:', err);
        throw new Error(err.message || 'Failed to unflag audit log');
      }
    },

    /**
     * Delete audit log (admin only - for testing)
     */
    async deleteLog(logId) {
      logger('Deleting log:', logId);

      try {
        const { error } = await supabase
          .from('audit_logs')
          .delete()
          .eq('id', logId);

        if (error) throw error;

        // Remove from store
        update(state => ({
          ...state,
          logs: state.logs.filter(log => log.id !== logId),
          totalCount: state.totalCount - 1
        }));

        logger('Log deleted successfully');
        return { success: true };

      } catch (err) {
        logger('Error deleting log:', err);
        throw new Error(err.message || 'Failed to delete audit log');
      }
    },

    /**
     * Delete multiple audit logs (admin only - for testing)
     */
    async deleteLogs(logIds) {
      logger('Deleting', logIds.length, 'logs');

      try {
        const { error } = await supabase
          .from('audit_logs')
          .delete()
          .in('id', logIds);

        if (error) throw error;

        // Remove from store
        update(state => ({
          ...state,
          logs: state.logs.filter(log => !logIds.includes(log.id)),
          totalCount: state.totalCount - logIds.length
        }));

        logger('Logs deleted successfully');
        return { success: true };

      } catch (err) {
        logger('Error deleting logs:', err);
        throw new Error(err.message || 'Failed to delete audit logs');
      }
    },

    /**
     * Get statistics
     */
    async getStats(days = 30) {
      logger('Fetching stats for last', days, 'days');

      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
          .from('audit_logs')
          .select('event_type, event_category, severity, flagged')
          .gte('created_at', startDate.toISOString());

        if (error) throw error;

        const stats = {
          totalEvents: data.length,
          totalLogins: data.filter(l => l.event_type === 'login').length,
          failedLogins: data.filter(l => l.event_type === 'failed_login').length,
          dataChanges: data.filter(l => ['create', 'update', 'delete'].includes(l.event_type)).length,
          permissionChanges: data.filter(l => l.event_type === 'permission_change').length,
          criticalEvents: data.filter(l => l.severity === 'critical').length,
          warningEvents: data.filter(l => l.severity === 'warning').length,
          flaggedEvents: data.filter(l => l.flagged).length,
          authEvents: data.filter(l => l.event_category === 'auth').length,
          userEvents: data.filter(l => l.event_category === 'users').length,
          issueEvents: data.filter(l => l.event_category === 'issues').length
        };

        logger('Stats:', stats);
        return stats;

      } catch (err) {
        logger('Error fetching stats:', err);
        throw new Error(err.message || 'Failed to fetch statistics');
      }
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    reset() {
      set({
        logs: [],
        loading: false,
        error: null,
        totalCount: 0,
        hasMore: false,
        currentFilters: null
      });
    }
  };
}

export const auditLogsStore = createAuditLogsStore();
