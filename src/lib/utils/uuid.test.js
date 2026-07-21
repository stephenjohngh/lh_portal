// src/lib/utils/uuid.test.js
import { describe, it, expect } from 'vitest';
import { newUuid } from './uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newUuid', () => {
  it('returns an RFC-4122 v4 UUID', () => {
    expect(newUuid()).toMatch(V4);
  });

  it('is unique across many calls', () => {
    const set = new Set(Array.from({ length: 1000 }, () => newUuid()));
    expect(set.size).toBe(1000);
  });
});
