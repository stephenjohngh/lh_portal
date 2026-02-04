// src/lib/utils/validation.js

/**
 * Validation utilities for form inputs and data
 */

/**
 * Check if value is required (not empty/null/undefined)
 * @param {any} value - Value to check
 * @returns {boolean} True if value exists and is not empty
 */
export function isRequired(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Check password strength (minimum 8 characters)
 * @param {string} password - Password to check
 * @returns {boolean} True if password is strong enough
 */
export function isStrongPassword(password) {
  if (!password) return false;
  return password.length >= 8;
}

/**
 * Validate password strength with detailed requirements
 * @param {string} password - Password to validate
 * @returns {object} Validation result with details
 */
export function validatePassword(password) {
  const result = {
    isValid: false,
    errors: []
  };

  if (!password) {
    result.errors.push('Password is required');
    return result;
  }

  if (password.length < 8) {
    result.errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    result.errors.push('Password must contain an uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    result.errors.push('Password must contain a lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    result.errors.push('Password must contain a number');
  }

  result.isValid = result.errors.length === 0;
  return result;
}

/**
 * Check if date is valid
 * @param {string|Date} date - Date to validate
 * @returns {boolean} True if valid date
 */
export function isValidDate(date) {
  if (!date) return false;
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
}

/**
 * Check if date is in the future
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if date is in future
 */
export function isFutureDate(date) {
  if (!isValidDate(date)) return false;
  return new Date(date) > new Date();
}

/**
 * Check if date is in the past
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if date is in past
 */
export function isPastDate(date) {
  if (!isValidDate(date)) return false;
  return new Date(date) < new Date();
}

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @returns {boolean} True if length is within bounds
 */
export function isValidLength(value, min = 0, max = Infinity) {
  if (!value) return min === 0;
  return value.length >= min && value.length <= max;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate number is within range
 * @param {number} value - Number to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if number is within range
 */
export function isInRange(value, min = -Infinity, max = Infinity) {
  if (value === null || value === undefined) return false;
  const num = Number(value);
  if (isNaN(num)) return false;
  return num >= min && num <= max;
}

/**
 * Create a composite validator from multiple rules
 * @param {Array<{validate: Function, message: string}>} rules - Array of validation rules
 * @returns {Function} Validator function
 */
export function createValidator(rules) {
  return (value) => {
    const errors = [];
    for (const rule of rules) {
      if (!rule.validate(value)) {
        errors.push(rule.message);
      }
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  };
}

/**
 * Sanitize string input (remove leading/trailing whitespace)
 * @param {string} value - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(value) {
  if (!value) return '';
  return value.trim();
}

/**
 * Validate phone number format (basic)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  // Basic phone validation: 10-15 digits, allows spaces, dashes, parentheses
  const re = /^[\d\s\-()]+$/;
  const digits = phone.replace(/\D/g, '');
  return re.test(phone) && digits.length >= 10 && digits.length <= 15;
}

/**
 * Validate positive number
 * @param {number} value - Value to check
 * @returns {boolean} True if positive number
 */
export function isPositiveNumber(value) {
  const num = Number(value);
  return !isNaN(num) && num > 0;
}

/**
 * Validate integer (whole number)
 * @param {number} value - Value to check
 * @returns {boolean} True if integer
 */
export function isInteger(value) {
  const num = Number(value);
  return !isNaN(num) && Number.isInteger(num);
}
