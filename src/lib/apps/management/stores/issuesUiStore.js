// src/lib/apps/management/stores/issuesUiStore.js
// Module-level singleton for Issues-tab UI state that must survive
// ManagementApp being destroyed when the user switches to another app.
import { writable } from 'svelte/store';

export const issuesUiState = writable({
  scrollY:          0,    // scroll position when last on the Issues tab
  expandedSections: {},   // { [issueId]: { activities: bool, actions: bool } }
});
