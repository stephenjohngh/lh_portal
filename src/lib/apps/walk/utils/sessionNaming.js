// src/lib/apps/walk/utils/sessionNaming.js
// Utility functions for generating walk session names

/**
 * Generates a standardized session name based on session parameters
 * Format: {ElementType}_{Emergency?}__{Building}_{Floor/Building}_{Date}
 * Examples:
 *   - "Communal_Door_LH_F2_Feb26"
 *   - "Light_Emergency_LH_Building_Feb26"
 */
export function generateSessionName({ 
  sessionMode, 
  building, 
  floorLevel = null, 
  elementType, 
  lightSubtypeFilter = null 
}) {
  const date = new Date();
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const year = date.toLocaleDateString('en-GB', { year: '2-digit' });
  const dateStr = `${month}${year}`;
  
  const typeStr = formatElementType(elementType);
  const emergencyStr = elementType === 'light' && lightSubtypeFilter === 'emergency' ? '_Emergency' : '';
  const buildingStr = buildingInitials(building);
  const scopeStr = sessionMode === 'building' ? 'Building' : `F${floorLevel}`;
  
  return `${typeStr}${emergencyStr}_${buildingStr}_${scopeStr}_${dateStr}`;
}

/**
 * Formats element type for display in session name
 * Converts snake_case to PascalCase
 */
function formatElementType(elementType) {
  return elementType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
}

/**
 * Extracts initials from a building name
 * Examples:
 *   - "Lincoln House" → "LH"
 *   - "Block A" → "BA"
 *   - "Main Building" → "MB"
 */
export function buildingInitials(name) {
  if (!name) return 'UNK';
  
  return name
    .split(/\s+/)
    .map(word => word[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .join('');
}

/**
 * Validates session name format
 */
export function isValidSessionName(name) {
  if (!name || name.length < 5 || name.length > 100) return false;
  // Allow alphanumeric, underscores, and hyphens
  return /^[A-Za-z0-9_-]+$/.test(name);
}

/**
 * Parses a session name back into components (if possible)
 */
export function parseSessionName(name) {
  const parts = name.split('_');
  if (parts.length < 4) return null;
  
  return {
    elementType: parts[0],
    isEmergency: parts.includes('Emergency'),
    building: parts.find(p => p.length === 2 && /^[A-Z]{2}$/.test(p)),
    scope: parts.find(p => p.startsWith('F') || p === 'Building'),
    date: parts[parts.length - 1]
  };
}
