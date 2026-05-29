// src/lib/apps/management/stores/activitySortStore.js
// Module-level singleton that persists the activity sort preference
// across Issues tab navigation (tab switch destroys/recreates ActivityLogSection).
import { writable } from 'svelte/store';

export const activitySort = writable({ field: 'updated_at', dir: 'desc' });
