import { describe, it, expect } from 'vitest';
import { scrubText, scrubDeep } from './scrubSecrets.js';

const TOKEN = 'k3Jx_9aB-QwErTy0123456789abcdefABCDEFghijk';

describe('scrubSecrets', () => {
  it('removes a pack token from a page address and a file address', () => {
    expect(scrubText(`https://x.example/pack/${TOKEN}?a=1`)).toBe('https://x.example/pack/[token]?a=1');
    expect(scrubText(`/api/pack/${TOKEN}/file/abc`)).toBe('/api/pack/[token]/file/abc');
  });

  it('reaches every string in an event, however nested', () => {
    const event = {
      request: { url: `https://x/pack/${TOKEN}` },
      breadcrumbs: [{ data: { url: `/api/pack/${TOKEN}/unlock` } }],
      message: `failed at /pack/${TOKEN}`,
      level: 'error', count: 3,
    };
    const out = scrubDeep(event);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(out.level).toBe('error');
    expect(out.count).toBe(3);
  });

  it('leaves other addresses alone', () => {
    expect(scrubText('/info/some-note')).toBe('/info/some-note');
  });
});
