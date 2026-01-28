// src/lib/utils/priorities.js

/**
 * Priority level definitions
 */
export const PRIORITIES = [
  { value: 1, label: 'Top Priority', color: 'bg-slate-600' },
  { value: 2, label: 'Major Project', color: 'bg-slate-600' },
  { value: 3, label: 'Important', color: 'bg-slate-600' },
  { value: 4, label: 'Minor', color: 'bg-slate-600' },
  { value: 5, label: 'Pending', color: 'bg-slate-600' }
];

/**
 * Get priority label and color for a given priority value
 * @param {number} priority - Priority value (1-5)
 * @returns {object} Priority object with label and color
 */
export function getPriorityLabel(priority) {
  const p = PRIORITIES.find(p => p.value === parseInt(priority));
  return p || PRIORITIES[2]; // Default to "Important" (priority 3)
}

/**
 * Get priority color class for a given priority value
 * @param {number} priority - Priority value (1-5)
 * @returns {string} Tailwind color class
 */
export function getPriorityColor(priority) {
  return getPriorityLabel(priority).color;
}

/**
 * Get priority text for a given priority value
 * @param {number} priority - Priority value (1-5)
 * @returns {string} Priority label text
 */
export function getPriorityText(priority) {
  return getPriorityLabel(priority).label;
}
