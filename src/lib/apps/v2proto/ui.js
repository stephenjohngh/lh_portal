// Shared Tailwind class constants for the v2proto dark-theme UI
export const inp = 'bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 w-full';
export const sec = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';
export const btnPrimary = 'px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors';
export const btnSecondary = 'px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors';
export const btnDanger = 'px-4 py-2 text-sm rounded-lg bg-red-900/40 hover:bg-red-800/50 text-red-400 border border-red-800/40 transition-colors';

// Canonical status list — single source of truth for colours and labels
export const STATUSES = [
  { value: 'ok',       label: 'OK',       dot: 'bg-green-400',  bg: 'bg-green-600',  ring: 'ring-green-500',  badge: 'bg-green-900/50 text-green-400',  dim: 'bg-green-900/30 text-green-700'  },
  { value: 'problem',  label: 'Problem',  dot: 'bg-amber-400',  bg: 'bg-yellow-600', ring: 'ring-yellow-500', badge: 'bg-amber-900/50 text-amber-400',  dim: 'bg-yellow-900/20 text-yellow-700' },
  { value: 'failed',   label: 'Failed',   dot: 'bg-red-400',    bg: 'bg-red-600',    ring: 'ring-red-500',    badge: 'bg-red-900/50 text-red-400',      dim: 'bg-red-900/20 text-red-700'     },
  { value: 'inactive', label: 'Inactive', dot: 'bg-slate-500',  bg: 'bg-slate-600',  ring: 'ring-slate-500',  badge: 'bg-slate-700 text-slate-500',     dim: 'bg-slate-700 text-slate-500'    },
];

// Helper to look up a status config by value
export function statusCfg(value) {
  return STATUSES.find(s => s.value === (value ?? 'ok')) ?? STATUSES[0];
}
