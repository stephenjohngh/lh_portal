// src/lib/utils/debug.js
/**
 * Centralized debug logging utility
 * 
 * Usage:
 *   import { debug } from '$lib/utils/debug';
 *   
 *   debug.log('Normal message');
 *   debug.info('Info message', data);
 *   debug.warn('Warning message');
 *   debug.error('Error message', error);
 *   debug.trace('Trace with stack');
 * 
 * Configuration:
 *   - Set DEBUG environment variable in .env file
 *   - Use browser localStorage: localStorage.setItem('DEBUG', '*')
 *   - Programmatic: debug.setLevel('info')
 */

// Log levels (0 = silent, 5 = verbose)
const LOG_LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  log: 4,
  trace: 5
};

class DebugLogger {
  constructor() {
    this.level = this.getInitialLevel();
    this.namespace = '';
    this.colors = {
      error: '#ff4444',
      warn: '#ffaa00',
      info: '#4488ff',
      log: '#44ff44',
      trace: '#aa44ff'
    };
  }

  /**
   * Get initial log level from environment or localStorage
   */
  getInitialLevel() {
    // Check if we're in browser
    if (typeof window !== 'undefined') {
      // Check localStorage first
      const storedLevel = localStorage.getItem('DEBUG_LEVEL');
      if (storedLevel && LOG_LEVELS[storedLevel] !== undefined) {
        return storedLevel;
      }

      // Check for DEBUG flag (wildcard or specific namespaces)
      const debugFlag = localStorage.getItem('DEBUG');
      if (debugFlag === '*' || debugFlag === 'true') {
        return 'trace'; // Show everything
      }
    }

    // Check import.meta.env (Vite environment variables)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // In development mode, default to 'log' level
      if (import.meta.env.DEV) {
        return import.meta.env.VITE_DEBUG_LEVEL || 'log';
      }
      // In production, default to 'warn' (only warnings and errors)
      return import.meta.env.VITE_DEBUG_LEVEL || 'warn';
    }

    // Default fallback
    return 'warn';
  }

  /**
   * Set log level programmatically
   */
  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.level = level;
      if (typeof window !== 'undefined') {
        localStorage.setItem('DEBUG_LEVEL', level);
      }
      console.log(`%c[DEBUG] Log level set to: ${level}`, 'color: #4488ff; font-weight: bold');
    } else {
      console.error(`Invalid log level: ${level}. Valid levels:`, Object.keys(LOG_LEVELS));
    }
  }

  /**
   * Get current log level
   */
  getLevel() {
    return this.level;
  }

  /**
   * Check if a log level is enabled
   */
  shouldLog(level) {
    return LOG_LEVELS[this.level] >= LOG_LEVELS[level];
  }

  /**
   * Format log message with namespace and styling
   */
  formatMessage(level, namespace, args) {
    const timestamp = new Date().toLocaleTimeString();
    const color = this.colors[level];
    const prefix = namespace ? `[${namespace}]` : '';
    
    return {
      style: `color: ${color}; font-weight: bold`,
      prefix: `[${timestamp}] ${prefix}`,
      args
    };
  }

  /**
   * Core logging function
   */
  _log(level, ...args) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, this.namespace, args);
    
    switch (level) {
      case 'error':
        console.error(`%c${formatted.prefix}`, formatted.style, ...formatted.args);
        break;
      case 'warn':
        console.warn(`%c${formatted.prefix}`, formatted.style, ...formatted.args);
        break;
      case 'trace':
        console.trace(`%c${formatted.prefix}`, formatted.style, ...formatted.args);
        break;
      default:
        console.log(`%c${formatted.prefix}`, formatted.style, ...formatted.args);
    }
  }

  /**
   * Public logging methods
   */
  error(...args) {
    this._log('error', ...args);
  }

  warn(...args) {
    this._log('warn', ...args);
  }

  info(...args) {
    this._log('info', ...args);
  }

  log(...args) {
    this._log('log', ...args);
  }

  trace(...args) {
    this._log('trace', ...args);
  }

  /**
   * Create a namespaced logger
   * Example: const log = debug.namespace('IssuesStore');
   */
  namespace(name) {
    const namespacedLogger = new DebugLogger();
    namespacedLogger.level = this.level;
    namespacedLogger.namespace = name;
    namespacedLogger.colors = this.colors;
    return namespacedLogger;
  }

  /**
   * Group logs (useful for complex operations)
   */
  group(label, collapsed = false) {
    if (!this.shouldLog('log')) return;
    if (collapsed) {
      console.groupCollapsed(label);
    } else {
      console.group(label);
    }
  }

  groupEnd() {
    if (!this.shouldLog('log')) return;
    console.groupEnd();
  }

  /**
   * Time tracking
   */
  time(label) {
    if (!this.shouldLog('log')) return;
    console.time(label);
  }

  timeEnd(label) {
    if (!this.shouldLog('log')) return;
    console.timeEnd(label);
  }

  /**
   * Table output (useful for arrays/objects)
   */
  table(data) {
    if (!this.shouldLog('log')) return;
    console.table(data);
  }
}

// Export singleton instance
export const debug = new DebugLogger();

// Export log levels for reference
export { LOG_LEVELS };

// Helper to enable/disable debugging from browser console
if (typeof window !== 'undefined') {
  window.debugUtils = {
    setLevel: (level) => debug.setLevel(level),
    getLevel: () => debug.getLevel(),
    enable: () => debug.setLevel('trace'),
    disable: () => debug.setLevel('silent'),
    levels: LOG_LEVELS
  };
}
