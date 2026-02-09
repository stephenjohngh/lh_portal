// src/lib/apps/users/stores/usersStore.js

/**
 * Users Store - Centralized state management for users
 */

import { writable, derived } from 'svelte/store';
import { api } from '$lib/utils/api';

function createUsersStore() {
  const { subscribe, set, update } = writable({
    users: [],
    loading: false,
    error: null,
    searchTerm: ''
  });

  return {
    subscribe,

    /**
     * Fetch all users from database
     */
    async fetchUsers() {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const users = await api.get('profiles', {
          orderBy: 'created_at',
          ascending: false
        });
        
        update(state => ({
          ...state,
          users,
          loading: false
        }));
        
        return users;
      } catch (error) {
        console.error('Error fetching users:', error);
        update(state => ({
          ...state,
          error: error.message,
          loading: false
        }));
        throw error;
      }
    },

    /**
     * Refresh users list
     */
    async refresh() {
      return this.fetchUsers();
    },

    /**
     * Set search term for filtering
     */
    setSearchTerm(term) {
      update(state => ({ ...state, searchTerm: term }));
    },

    /**
     * Clear search
     */
    clearSearch() {
      update(state => ({ ...state, searchTerm: '' }));
    },

    /**
     * Reset store
     */
    reset() {
      set({
        users: [],
        loading: false,
        error: null,
        searchTerm: ''
      });
    }
  };
}

export const usersStore = createUsersStore();

/**
 * Derived store for filtered users based on search term
 */
export const filteredUsers = derived(
  usersStore,
  $store => {
    if (!$store.searchTerm) return $store.users;
    
    const term = $store.searchTerm.toLowerCase();
    return $store.users.filter(user =>
      user.email?.toLowerCase().includes(term) ||
      user.full_name?.toLowerCase().includes(term)
    );
  }
);
