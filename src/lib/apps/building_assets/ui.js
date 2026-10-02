// Shared Tailwind class constants for the Building Assets dark-theme UI
export const inp = 'bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 w-full';
export const sec = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';
// Status config (STATUSES, statusCfg) — re-exported from shared constants
// so that any code importing from ui.js continues to work unchanged.
export { STATUSES, statusCfg } from '$lib/utils/resultConstants.js';
