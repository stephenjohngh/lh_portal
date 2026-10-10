import { describe, it, expect } from 'vitest';
import { cameraPlatform, cameraHelp } from './cameraHelp.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  ipad:         'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsung:      'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  desktop:      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

describe('which phone and browser', () => {
  it('tells them apart', () => {
    expect(cameraPlatform(UA.iphoneSafari)).toBe('ios-safari');
    expect(cameraPlatform(UA.iphoneChrome)).toBe('ios-other');
    expect(cameraPlatform(UA.ipad, 5)).toBe('ios-safari');      // iPadOS says it is a Mac
    expect(cameraPlatform(UA.ipad, 0)).toBe('other');           // a real Mac
    expect(cameraPlatform(UA.androidChrome)).toBe('android-chrome');
    expect(cameraPlatform(UA.samsung)).toBe('android-other');
    expect(cameraPlatform(UA.desktop)).toBe('other');
  });
});

describe('what to do when the camera is refused', () => {
  it('iPhone Safari: the site setting in Safari, then the Settings app', () => {
    const h = cameraHelp('NotAllowedError', UA.iphoneSafari);
    expect(h.retry).toBe(true);
    expect(h.steps.join(' ')).toMatch(/Website Settings.*Camera.*Allow/);
    expect(h.steps.join(' ')).toMatch(/Settings app.*Safari.*Camera/);
  });

  it('Android Chrome: the site permission, then Chrome’s own app permission', () => {
    const h = cameraHelp('NotAllowedError', UA.androidChrome);
    expect(h.steps.join(' ')).toMatch(/Permissions.*Camera.*Allow/);
    expect(h.steps.join(' ')).toMatch(/Apps.*Chrome.*Permissions.*Camera/);
  });

  it('Chrome on an iPhone is set in the iPhone’s Settings app', () => {
    expect(cameraHelp('NotAllowedError', UA.iphoneChrome).steps[0]).toMatch(/Settings app.*Camera on/);
  });

  it('other failures say what happened, and offer a retry only where one can help', () => {
    expect(cameraHelp('NotReadableError', UA.androidChrome)).toMatchObject({ title: expect.stringMatching(/in use/), retry: true });
    expect(cameraHelp('NotFoundError', UA.desktop)).toMatchObject({ title: expect.stringMatching(/No camera/), retry: false });
    expect(cameraHelp('InsecureContext', UA.desktop)).toMatchObject({ title: expect.stringMatching(/https/), retry: false });
    expect(cameraHelp(undefined, UA.desktop).retry).toBe(true);
    // blocked by the site's own header: no phone setting helps, so none is suggested
    const blocked = cameraHelp('PolicyBlocked', UA.androidChrome);
    expect(blocked).toMatchObject({ retry: false, title: expect.stringMatching(/portal/) });
    expect(blocked.steps.join(' ')).not.toMatch(/Permissions|Site settings/);
  });
});
