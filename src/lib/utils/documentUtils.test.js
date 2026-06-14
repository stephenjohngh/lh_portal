// src/lib/utils/documentUtils.test.js
// Document-library formatting helpers: file size, MIME → icon/doc-type, and
// the certificate expiry status windows.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatFileSize, mimeIcon, docTypeFromMime,
  getExpiryStatus, isExpired, isExpiringSoon,
  docTypeLabel, categoryLabel,
} from './documentUtils.js';

describe('formatFileSize', () => {
  it('formats across unit boundaries', () => {
    expect(formatFileSize(0)).toBe('—');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('mimeIcon', () => {
  it('maps known types and falls back to a paperclip', () => {
    expect(mimeIcon('application/pdf')).toBe('📄');
    expect(mimeIcon('image/png')).toBe('🖼');
    expect(mimeIcon('application/x-unknown')).toBe('📎');
  });
});

describe('docTypeFromMime', () => {
  it('derives a doc_type from the MIME family', () => {
    expect(docTypeFromMime('image/jpeg')).toBe('photo');
    expect(docTypeFromMime('application/pdf')).toBe('pdf');
    expect(docTypeFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word');
    expect(docTypeFromMime('text/csv')).toBe('spreadsheet');
    expect(docTypeFromMime('application/zip')).toBe('other');
    expect(docTypeFromMime(null)).toBe('other');
  });
});

describe('expiry status', () => {
  const NOW = new Date('2026-06-14T00:00:00Z').getTime();
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(()  => { vi.useRealTimers(); });
  const inDays = (d) => new Date(NOW + d * 86_400_000).toISOString();

  it('classifies expired / expiring-soon / ok / null', () => {
    expect(getExpiryStatus(inDays(-1))).toBe('expired');
    expect(getExpiryStatus(inDays(10))).toBe('expiring-soon');
    expect(getExpiryStatus(inDays(90))).toBe('ok');
    expect(getExpiryStatus(null)).toBeNull();
  });

  it('isExpired / isExpiringSoon are derived predicates', () => {
    expect(isExpired(inDays(-1))).toBe(true);
    expect(isExpired(inDays(10))).toBe(false);
    expect(isExpiringSoon(inDays(10))).toBe(true);
    expect(isExpiringSoon(inDays(90))).toBe(false);
  });
});

describe('label lookups', () => {
  it('resolve known values and fall back to the raw value / dash', () => {
    expect(docTypeLabel('pdf')).toBe('PDF');
    expect(docTypeLabel('mystery')).toBe('mystery');
    expect(docTypeLabel(null)).toBe('—');
    expect(categoryLabel('ews1')).toBe('EWS1');
    expect(categoryLabel('unknown')).toBe('unknown');
  });
});
