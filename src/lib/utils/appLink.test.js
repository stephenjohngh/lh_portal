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

// ── An app's own tab, reused ────────────────────────────────────────────────
import { vi } from 'vitest';
import { openAppInTab, listenForAppRequests, appTabName, isOpenAppMessage, OPEN_APP_ACK } from './appLink.js';

/** A fake window: listeners, open() returning a fake tab, postMessage between them. */
function fakeWindow(origin = 'https://portal.test') {
  const listeners = new Set();
  const w = {
    location: { origin, href: `${origin}/` },
    addEventListener: (t, f) => t === 'message' && listeners.add(f),
    removeEventListener: (t, f) => t === 'message' && listeners.delete(f),
    deliver: (data, source, from = origin) => [...listeners].forEach((f) => f({ data, source, origin: from })),
    listeners,
  };
  return w;
}

describe('openAppInTab', () => {
  it('names one tab per app', () => {
    expect(appTabName('building_assets')).toBe('lh-portal-building_assets');
    expect(appTabName('a b/c')).toBe('lh-portal-abc');
  });

  it('a first link opens the app’s tab at the address', () => {
    const win = fakeWindow();
    const tab = { location: { href: 'about:blank' }, focus: vi.fn() };
    win.open = vi.fn(() => tab);
    expect(openAppInTab('building_assets', { component: 'c1' }, { win })).toBe('opened');
    expect(win.open).toHaveBeenCalledWith('', 'lh-portal-building_assets');
    expect(tab.location.href).toBe('/?app=building_assets&component=c1');
  });

  it('a later link asks the open tab, which answers; it is not reloaded', () => {
    vi.useFakeTimers();
    const win = fakeWindow();
    const tabWin = fakeWindow();
    const tab = { location: { href: 'https://portal.test/' }, focus: vi.fn(),
      postMessage: (data) => tabWin.deliver(data, win) };
    win.open = vi.fn(() => tab);
    win.postMessage = (data) => win.deliver(data, tab);
    const handled = [];
    listenForAppRequests((app, params) => handled.push([app, params]), tabWin);
    // the tab's answer goes back to us
    tabWin.listeners.forEach(() => {});
    const realDeliver = tabWin.deliver;
    tabWin.deliver = (data, source) => realDeliver(data, { postMessage: (m) => win.deliver(m, tab) });

    expect(openAppInTab('building_assets', { component: 'c2' }, { win, ackMs: 50 })).toBe('sent');
    vi.advanceTimersByTime(60);
    expect(handled).toEqual([['building_assets', { component: 'c2' }]]);
    expect(tab.location.href).toBe('https://portal.test/');   // not reloaded
    vi.useRealTimers();
  });

  it('a tab that does not answer is sent to the address instead', () => {
    vi.useFakeTimers();
    const win = fakeWindow();
    const tab = { location: { href: 'https://portal.test/login' }, focus: vi.fn(), postMessage: vi.fn() };
    win.open = vi.fn(() => tab);
    openAppInTab('dossier', { pack: 'p1' }, { win, ackMs: 50 });
    vi.advanceTimersByTime(60);
    expect(tab.location.href).toBe('/?app=dossier&pack=p1');
    vi.useRealTimers();
  });

  it('a blocked pop-up says so, so the link can open normally', () => {
    const win = fakeWindow();
    win.open = () => null;
    expect(openAppInTab('dossier', {}, { win })).toBe('blocked');
  });
});

describe('listenForAppRequests', () => {
  it('ignores another site and anything not shaped as a request', () => {
    const w = fakeWindow();
    const got = [];
    listenForAppRequests((a) => got.push(a), w);
    w.deliver({ type: 'lh-open-app', app: 'admin' }, null, 'https://evil.test');
    w.deliver({ type: 'something-else' }, null);
    w.deliver({ type: 'lh-open-app', app: 'x', params: { n: 1 } }, null);
    expect(got).toEqual([]);
    expect(isOpenAppMessage({ type: 'lh-open-app', app: 'dossier', params: { pack: 'p' } })).toBe(true);
  });

  it('answers the asking tab', () => {
    const w = fakeWindow();
    const source = { postMessage: vi.fn() };
    listenForAppRequests(() => {}, w);
    w.deliver({ type: 'lh-open-app', app: 'dossier', params: {} }, source);
    expect(source.postMessage).toHaveBeenCalledWith({ type: OPEN_APP_ACK }, 'https://portal.test');
  });
});
