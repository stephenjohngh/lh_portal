// src/lib/apps/building_assets/stores/helpers.js
// Shared utilities used across all building_assets action modules.

import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth';

// -- Auth guard -------------------------------------------------------------
// Call at the top of any write method. Throws immediately if no user is
// authenticated so no DB write occurs with a null created_by / updated_by.
export function requireUserId() {
  const userId = get(auth).user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

