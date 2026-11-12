import { describe, it, expect } from 'vitest';
import { recordLinkFor } from './recordLinks.js';
import { fromUnaddressedFault } from './linked.js';

describe('recordLinkFor', () => {
  it('an open fault opens its component in Building Assets', () => {
    const item = fromUnaddressedFault({ id: 'comp-1', status: 'failed', label: '56' }, '2026-11-12');
    expect(recordLinkFor(item)).toMatchObject({ app: 'building_assets', params: { component: 'comp-1' } });
  });
  it('anything else has no link', () => {
    expect(recordLinkFor({ linked: true, source: 'meeting', sourceId: 'm1' })).toBeNull();
    expect(recordLinkFor({ linked: false })).toBeNull();
    expect(recordLinkFor(null)).toBeNull();
  });
});
