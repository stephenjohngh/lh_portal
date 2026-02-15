// src/lib/utils/actionSort.js
// DEBUG VERSION with detailed logging
// Utility function for consistent action sorting across the application

import { getLogger } from '$lib/utils/logger';

const logger = getLogger('actionSort');

/**
 * Sort actions by priority order:
 * 1. Status: in-progress → pending → completed
 * 2. Deadline: earliest first, no deadline last
 * 3. Created date: earliest first
 * 
 * @param {Array} actions - Array of action objects
 * @returns {Array} Sorted copy of actions array
 */
export function sortActions(actions) {
  logger('======================================');
  logger('sortActions called');
  logger('Input actions count:', actions?.length || 0);
  
  if (!actions || !Array.isArray(actions)) {
    logger('❌ Invalid input - returning empty array');
    return [];
  }
  
  // Log input data
  logger('Input actions:');
  actions.forEach((a, i) => {
    logger(`  ${i + 1}. [${a.status}] ${a.action_text?.substring(0, 30) || 'no text'} | deadline: ${a.date_deadline || 'none'} | created: ${a.created_at}`);
  });
  
  // Status priority order
  const statusOrder = { 
    'in-progress': 1, 
    'pending': 2, 
    'completed': 3 
  };
  
  logger('Starting sort...');
  
  const sorted = [...actions].sort((a, b) => {
    const aText = a.action_text?.substring(0, 20) || 'no text';
    const bText = b.action_text?.substring(0, 20) || 'no text';
    
    logger(`\n--- Comparing ---`);
    logger(`  A: [${a.status}] ${aText} | deadline: ${a.date_deadline || 'none'}`);
    logger(`  B: [${b.status}] ${bText} | deadline: ${b.date_deadline || 'none'}`);
    
    // 1. Sort by status priority (in-progress → pending → completed)
    const statusA = statusOrder[a.status] || 999;
    const statusB = statusOrder[b.status] || 999;
    
    logger(`  Status priority: A=${statusA}, B=${statusB}`);
    
    if (statusA !== statusB) {
      const result = statusA - statusB;
      logger(`  → Different status, result: ${result} (${result < 0 ? 'A first' : 'B first'})`);
      return result;
    }
    
    logger(`  → Same status, checking deadlines...`);
    
    // 2. Sort by date_deadline (earliest first, nulls last)
    const hasDeadlineA = a.date_deadline !== null && a.date_deadline !== undefined && a.date_deadline !== '';
    const hasDeadlineB = b.date_deadline !== null && b.date_deadline !== undefined && b.date_deadline !== '';
    
    logger(`  Has deadline: A=${hasDeadlineA}, B=${hasDeadlineB}`);
    
    // Actions with deadlines come before those without
    if (hasDeadlineA && !hasDeadlineB) {
      logger(`  → Only A has deadline, A first`);
      return -1;
    }
    if (!hasDeadlineA && hasDeadlineB) {
      logger(`  → Only B has deadline, B first`);
      return 1;
    }
    
    // Both have deadlines - sort by earliest first
    if (hasDeadlineA && hasDeadlineB) {
      logger(`  → Both have deadlines, comparing dates...`);
      
      const deadlineA = new Date(a.date_deadline);
      const deadlineB = new Date(b.date_deadline);
      
      logger(`    Raw dates: A=${a.date_deadline}, B=${b.date_deadline}`);
      logger(`    Parsed: A=${deadlineA}, B=${deadlineB}`);
      
      // Set to midnight to compare dates only
      deadlineA.setHours(0, 0, 0, 0);
      deadlineB.setHours(0, 0, 0, 0);
      
      const timeA = deadlineA.getTime();
      const timeB = deadlineB.getTime();
      
      logger(`    Timestamps: A=${timeA}, B=${timeB}`);
      logger(`    Difference: ${timeA - timeB}`);
      logger(`    Valid: A=${!isNaN(timeA)}, B=${!isNaN(timeB)}`);
      
      if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
        const result = timeA - timeB;
        logger(`    → Result: ${result} (${result < 0 ? 'A first (earlier)' : 'B first (earlier)'})`);
        return result;
      }
      
      if (timeA === timeB) {
        logger(`    → Same deadline, checking created_at...`);
      }
    } else {
      logger(`  → Neither has deadline, checking created_at...`);
    }
    
    // 3. Sort by created_at (earliest first) as final tiebreaker
    const createdA = new Date(a.created_at);
    const createdB = new Date(b.created_at);
    
    const timeA = createdA.getTime();
    const timeB = createdB.getTime();
    
    logger(`  Created timestamps: A=${timeA}, B=${timeB}`);
    
    if (!isNaN(timeA) && !isNaN(timeB)) {
      const result = timeA - timeB;
      logger(`  → Created result: ${result} (${result < 0 ? 'A first (earlier)' : 'B first (earlier)'})`);
      return result;
    }
    
    // If all else fails, maintain original order
    logger(`  → Maintaining original order (return 0)`);
    return 0;
  });
  
  logger('\n======================================');
  logger('✅ Sort complete!');
  logger('Output actions:');
  sorted.forEach((a, i) => {
    logger(`  ${i + 1}. [${a.status}] ${a.action_text?.substring(0, 30) || 'no text'} | deadline: ${a.date_deadline || 'none'} | created: ${a.created_at}`);
  });
  logger('======================================\n');
  
  return sorted;
}
