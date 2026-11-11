import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { appRequest, openApp, appHref, requestFromSearch, takeAppParams } from './appLink.js';

describe('appLink', () => {
  it('an address for a new tab reads back as the same request', () => {
    const href = appHref('dossier', { pack: 'abc-123' });
    expect(href).toBe('/?app=dossier&pack=abc-123');
    expect(requestFromSearch(href.slice(1))).toEqual({ app: 'dossier', params: { pack: 'abc-123' } });
  });

  it('no app in the address is no request', () => {
    expect(requestFromSearch('?pack=1')).toBeNull();
    expect(requestFromSearch('')).toBeNull();
  });

  it('the target app takes its params once; another app never sees them', () => {
    openApp('dossier', { pack: 'p1' });
    expect(takeAppParams('management')).toBeNull();
    expect(get(appRequest)?.app).toBe('dossier');
    expect(takeAppParams('dossier')).toEqual({ pack: 'p1' });
    expect(takeAppParams('dossier')).toBeNull();   // reopening later does not jump again
  });
});
