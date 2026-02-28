// src/lib/apps/walk/utils/elementPriority.js
// Priority classification for failed elements

export const PRIORITY_LEVELS = {
  CRITICAL: 'critical',  // Safety-critical failures
  HIGH: 'high',          // Emergency/safety equipment
  MEDIUM: 'medium',      // Standard equipment
  LOW: 'low'            // Non-critical equipment
};

/**
 * Determines priority level for a failed element
 * Priority is based on:
 * 1. Element type (fire control = highest)
 * 2. Safety classification (emergency equipment)
 * 3. Location criticality
 */
export function getElementPriority(element) {
  // Fire control equipment is always high priority
  if (element.element_type === 'fire_control') {
    // Fire panels and alarms are critical
    if (['Panel', 'Call Point', 'AC Call Point'].includes(element.subtype)) {
      return PRIORITY_LEVELS.CRITICAL;
    }
    return PRIORITY_LEVELS.HIGH;
  }
  
  // Emergency lights are high priority
  if (element.element_type === 'light') {
    if (element.subtype === 'Exit' || element.emergency === true) {
      return PRIORITY_LEVELS.HIGH;
    }
    return PRIORITY_LEVELS.MEDIUM;
  }
  
  // Fire doors are high priority
  if (element.element_type === 'communal_door' || element.element_type === 'apartment_door') {
    if (element.subtype === 'Fire Door' || element.subtype === 'Emergency Exit') {
      return PRIORITY_LEVELS.HIGH;
    }
    return PRIORITY_LEVELS.MEDIUM;
  }
  
  // Everything else is medium priority
  return PRIORITY_LEVELS.MEDIUM;
}

/**
 * Categorizes an array of failed elements by priority
 * Returns object with priority levels as keys
 */
export function categorizeByPriority(elements) {
  return elements.reduce((acc, element) => {
    const priority = getElementPriority(element);
    if (!acc[priority]) acc[priority] = [];
    acc[priority].push(element);
    return acc;
  }, {
    [PRIORITY_LEVELS.CRITICAL]: [],
    [PRIORITY_LEVELS.HIGH]: [],
    [PRIORITY_LEVELS.MEDIUM]: [],
    [PRIORITY_LEVELS.LOW]: []
  });
}

/**
 * Sorts elements by priority (critical → low)
 */
export function sortByPriority(elements) {
  const priorityOrder = {
    [PRIORITY_LEVELS.CRITICAL]: 0,
    [PRIORITY_LEVELS.HIGH]: 1,
    [PRIORITY_LEVELS.MEDIUM]: 2,
    [PRIORITY_LEVELS.LOW]: 3
  };
  
  return [...elements].sort((a, b) => {
    const aPriority = priorityOrder[getElementPriority(a)];
    const bPriority = priorityOrder[getElementPriority(b)];
    return aPriority - bPriority;
  });
}

/**
 * Gets display label for priority level
 */
export function getPriorityLabel(priority) {
  const labels = {
    [PRIORITY_LEVELS.CRITICAL]: 'CRITICAL',
    [PRIORITY_LEVELS.HIGH]: 'HIGH PRIORITY',
    [PRIORITY_LEVELS.MEDIUM]: 'MEDIUM PRIORITY',
    [PRIORITY_LEVELS.LOW]: 'LOW PRIORITY'
  };
  return labels[priority] || 'UNKNOWN';
}

/**
 * Gets color for priority level (for UI)
 */
export function getPriorityColor(priority) {
  const colors = {
    [PRIORITY_LEVELS.CRITICAL]: '#dc2626',  // red-600
    [PRIORITY_LEVELS.HIGH]: '#ef4444',      // red-500
    [PRIORITY_LEVELS.MEDIUM]: '#f97316',    // orange-500
    [PRIORITY_LEVELS.LOW]: '#64748b'        // slate-500
  };
  return colors[priority] || '#64748b';
}

/**
 * Calculates urgency score based on priority and age
 * Used for sorting failed elements dashboard
 */
export function calculateUrgencyScore(element) {
  const priorityScores = {
    [PRIORITY_LEVELS.CRITICAL]: 1000,
    [PRIORITY_LEVELS.HIGH]: 500,
    [PRIORITY_LEVELS.MEDIUM]: 100,
    [PRIORITY_LEVELS.LOW]: 10
  };
  
  const priority = getElementPriority(element);
  const baseScore = priorityScores[priority] || 0;
  
  // Add age factor (older failures get higher score)
  if (element.status_set_at) {
    const ageInDays = (Date.now() - new Date(element.status_set_at)) / (1000 * 60 * 60 * 24);
    const ageFactor = Math.min(ageInDays * 10, 100); // Cap at 100
    return baseScore + ageFactor;
  }
  
  return baseScore;
}

/**
 * Determines if element failure should trigger immediate notification
 */
export function requiresImmediateNotification(element) {
  const priority = getElementPriority(element);
  return priority === PRIORITY_LEVELS.CRITICAL || priority === PRIORITY_LEVELS.HIGH;
}
