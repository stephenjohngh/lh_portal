import { describe, it, expect } from 'vitest';
import { CALLOUT_VARIANTS, normaliseVariant } from './calloutNode.js';

describe('callout variants', () => {
  it('calls the info callout Information, with a symbol icon', () => {
    const info = CALLOUT_VARIANTS.find(v => v.value === 'info');
    expect(info.label).toBe('Information');
    // The emoji form (with the variation selector) — the bare U+2139 draws as a plain letter i.
    expect(info.icon).toBe('ℹ️');
  });

  it('keeps the stored value, so existing callouts still read as the same kind', () => {
    expect(normaliseVariant('info')).toBe('info');
    expect(normaliseVariant('nonsense')).toBe('info');
  });
});
