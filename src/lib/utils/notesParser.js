// src/lib/utils/notesParser.js
// Utility to handle notes that may be in JSON key:value format

/**
 * Parses notes that may be in JSON format or plain text
 * If JSON format detected (key:value), returns only the value
 * Otherwise returns the notes as-is
 * 
 * @param {string} notes - The notes field from database
 * @returns {string} - Parsed notes value
 * 
 * Examples:
 *   parseNotesValue('{"issue":"Battery depleted"}') → "Battery depleted"
 *   parseNotesValue('issue:Battery depleted') → "Battery depleted"
 *   parseNotesValue('Battery depleted') → "Battery depleted"
 */
export function parseNotesValue(notes) {
  if (!notes || typeof notes !== 'string') return notes || '';
  
  const trimmed = notes.trim();
  
  // Try parsing as JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      // If it's an object with a single key, return that value
      const keys = Object.keys(parsed);
      if (keys.length === 1) {
        return String(parsed[keys[0]]);
      }
      // If multiple keys, join the values
      return keys.map(key => parsed[key]).join(', ');
    } catch (e) {
      // Not valid JSON, fall through
    }
  }
  
  // Try parsing as simple key:value format
  if (trimmed.includes(':')) {
    const colonIndex = trimmed.indexOf(':');
    const value = trimmed.substring(colonIndex + 1).trim();
    if (value) return value;
  }
  
  // Return as-is
  return trimmed;
}

/**
 * Parses notes and returns both key and value (if present)
 * 
 * @param {string} notes - The notes field from database
 * @returns {object} - { key: string|null, value: string }
 */
export function parseNotesKeyValue(notes) {
  if (!notes || typeof notes !== 'string') {
    return { key: null, value: notes || '' };
  }
  
  const trimmed = notes.trim();
  
  // Try parsing as JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const keys = Object.keys(parsed);
      if (keys.length === 1) {
        return { key: keys[0], value: String(parsed[keys[0]]) };
      }
      if (keys.length > 1) {
        return { 
          key: 'multiple', 
          value: keys.map(key => `${key}: ${parsed[key]}`).join(', ')
        };
      }
    } catch (e) {
      // Not valid JSON, fall through
    }
  }
  
  // Try parsing as simple key:value format
  if (trimmed.includes(':')) {
    const colonIndex = trimmed.indexOf(':');
    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();
    if (key && value) {
      return { key, value };
    }
  }
  
  // Return as-is
  return { key: null, value: trimmed };
}

/**
 * Creates JSON-style notes from key-value pair
 * 
 * @param {string} key - The key/label
 * @param {string} value - The actual note content
 * @returns {string} - Formatted as key:value
 */
export function formatNotesKeyValue(key, value) {
  if (!key || !value) return value || '';
  return `${key}:${value}`;
}

/**
 * Formats notes for display in tables/reports
 * Always shows only the value part
 * 
 * @param {string} notes - The notes field from database
 * @param {number} maxLength - Optional max length, will truncate with ellipsis
 * @returns {string} - Display-ready notes
 */
export function formatNotesForDisplay(notes, maxLength = null) {
  const value = parseNotesValue(notes);
  
  if (!maxLength || value.length <= maxLength) {
    return value;
  }
  
  return value.substring(0, maxLength - 3) + '...';
}

/**
 * Checks if notes are in JSON/key:value format
 * 
 * @param {string} notes - The notes field
 * @returns {boolean} - True if structured format detected
 */
export function isStructuredNotes(notes) {
  if (!notes || typeof notes !== 'string') return false;
  
  const trimmed = notes.trim();
  
  // Check for JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // Check for key:value format
  return trimmed.includes(':') && trimmed.indexOf(':') > 0 && trimmed.indexOf(':') < trimmed.length - 1;
}
