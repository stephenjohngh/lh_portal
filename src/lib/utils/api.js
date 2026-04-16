// src/lib/utils/api.js

/**
 * Centralized API client for all Supabase operations
 * Provides consistent error handling, logging, and retry logic
 */

import { supabase }    from '$lib/supabaseClient';
import { getLogger }   from '$lib/utils/logger';

const logger = getLogger('api');

/**
 * API Client Class
 */
class ApiClient {
  constructor() {
    this.retryAttempts = 3;
    this.retryDelay = 1000; // ms
  }

  /**
   * Handle API errors consistently
   * @private
   */
  handleError(operation, table, error) {
    logger(`❌ API Error [${operation} ${table}]:`, error);
    
    // Add more context to error
    const enhancedError = new Error(error.message || 'An error occurred');
    enhancedError.details = error.details;
    enhancedError.hint = error.hint;
    enhancedError.code = error.code;
    enhancedError.operation = operation;
    enhancedError.table = table;
    
    return enhancedError;
  }

  /**
   * Retry logic for failed requests
   * @private
   */
  async retry(fn, attempts = this.retryAttempts) {
    try {
      return await fn();
    } catch (error) {
      if (attempts <= 1) throw error;
      logger(`⚠️ Retrying... (${this.retryAttempts - attempts + 1}/${this.retryAttempts})`);
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      return this.retry(fn, attempts - 1);
    }
  }

  /**
   * Get records from a table
   * @param {string} table - Table name
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of records
   */
  async get(table, options = {}) {
    try {
      let query = supabase.from(table).select(options.select || '*');
      
      // Apply filters
      if (options.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      
      // Apply ordering
      if (options.orderBy) {
        query = query.order(options.orderBy, { 
          ascending: options.ascending !== false 
        });
      }
      
      // Apply limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Apply range
      if (options.range) {
        query = query.range(options.range.from, options.range.to);
      }
      
      const { data, error } = await query;
      
      if (error) throw this.handleError('GET', table, error);
      return data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a single record by ID
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @param {string} select - Fields to select
   * @returns {Promise<object|null>} Single record or null
   */
  async getById(table, id, select = '*') {
    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq('id', id)
        .single();
      
      if (error) {
        // Return null if not found, throw for other errors
        if (error.code === 'PGRST116') return null;
        throw this.handleError('GET_BY_ID', table, error);
      }
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new record
   * @param {string} table - Table name
   * @param {object} data - Data to insert
   * @param {boolean} returnRecord - Whether to return the created record
   * @returns {Promise<object>} Created record
   */
  async create(table, data, returnRecord = true) {
    try {
      let query = supabase.from(table).insert(data);
      
      if (returnRecord) {
        query = query.select().single();
      }
      
      const { data: result, error } = await query;
      
      if (error) throw this.handleError('CREATE', table, error);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create multiple records
   * @param {string} table - Table name
   * @param {Array<object>} dataArray - Array of records to insert
   * @param {boolean} returnRecords - Whether to return created records
   * @returns {Promise<Array>} Created records
   */
  async createMany(table, dataArray, returnRecords = true) {
    try {
      let query = supabase.from(table).insert(dataArray);
      
      if (returnRecords) {
        query = query.select();
      }
      
      const { data, error } = await query;
      
      if (error) throw this.handleError('CREATE_MANY', table, error);
      return data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update a record by ID
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @param {object} data - Data to update
   * @param {boolean} returnRecord - Whether to return updated record
   * @returns {Promise<object>} Updated record
   */
  async update(table, id, data, returnRecord = true) {
    try {
      let query = supabase
        .from(table)
        .update(data)
        .eq('id', id);
      
      if (returnRecord) {
        query = query.select().single();
      }
      
      const { data: result, error } = await query;
 
      if (error) throw this.handleError('UPDATE', table, error);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update multiple records matching filters
   * @param {string} table - Table name
   * @param {object} filters - Filter conditions
   * @param {object} data - Data to update
   * @param {boolean} returnRecords - Whether to return updated records
   * @returns {Promise<Array>} Updated records
   */
  async updateMany(table, filters, data, returnRecords = true) {
    try {
      let query = supabase.from(table).update(data);
      
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      if (returnRecords) {
        query = query.select();
      }
      
      const { data: result, error } = await query;
      
      if (error) throw this.handleError('UPDATE_MANY', table, error);
      return result || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a record by ID
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @returns {Promise<void>}
   */
  async delete(table, id) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      
      if (error) throw this.handleError('DELETE', table, error);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete multiple records matching filters
   * @param {string} table - Table name
   * @param {object} filters - Filter conditions
   * @returns {Promise<void>}
   */
  async deleteMany(table, filters) {
    try {
      let query = supabase.from(table).delete();
      
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      const { error } = await query;
      
      if (error) throw this.handleError('DELETE_MANY', table, error);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Count records matching filters
   * @param {string} table - Table name
   * @param {object} filters - Filter conditions
   * @returns {Promise<number>} Count of records
   */
  async count(table, filters = {}) {
    try {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      
      const { count, error } = await query;
      
      if (error) throw this.handleError('COUNT', table, error);
      return count || 0;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if a record exists
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @returns {Promise<boolean>} True if record exists
   */
  async exists(table, id) {
    try {
      const record = await this.getById(table, id, 'id');
      return record !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Upsert (insert or update) a record
   * @param {string} table - Table name
   * @param {object} data - Data to upsert
   * @param {object} options - Upsert options
   * @returns {Promise<object>} Upserted record
   */
  async upsert(table, data, options = {}) {
    try {
      const { data: result, error } = await supabase
        .from(table)
        .upsert(data, options)
        .select()
        .single();
      
      if (error) throw this.handleError('UPSERT', table, error);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute a stored procedure or RPC function
   * @param {string} functionName - Name of the function
   * @param {object} params - Function parameters
   * @returns {Promise<any>} Function result
   */
  async rpc(functionName, params = {}) {
    try {
      const { data, error } = await supabase.rpc(functionName, params);
      
      if (error) throw this.handleError('RPC', functionName, error);
      return data;
    } catch (error) {
      throw error;
    }
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing or custom instances
export { ApiClient };
