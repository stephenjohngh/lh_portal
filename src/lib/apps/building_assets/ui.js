// Shared Tailwind class constants for the Building Assets dark-theme UI
export const inp = 'bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 w-full';
export const sec = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';
export const btnPrimary = 'px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors';
export const btnSecondary = 'px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors';
export const btnDanger = 'px-4 py-2 text-sm rounded-lg bg-red-900/40 hover:bg-red-800/50 text-red-400 border border-red-800/40 transition-colors';

// Status config (STATUSES, statusCfg) — re-exported from shared constants
// so that any code importing from ui.js continues to work unchanged.
export { STATUSES, statusCfg } from '$lib/apps/v2/utils/resultConstants.js';
