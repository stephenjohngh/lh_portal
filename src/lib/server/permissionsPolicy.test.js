// The Permissions-Policy header (hooks.server.js) must allow what the portal
// uses. It said `camera=()` until 2026-10-10, which blocked the live camera for
// the portal itself: the 📷 scan was refused as "not allowed" on a real phone
// whatever its settings, while every test passed with a fake camera.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const hooks = readFileSync('src/hooks.server.js', 'utf8');
const policy = hooks.match(/'Permissions-Policy',\s*'([^']+)'/)?.[1] ?? '';
const directive = (name) => policy.split(',').map((d) => d.trim()).find((d) => d.startsWith(name + '='));

function sources(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|svelte)$/.test(n) && !n.endsWith('.test.js')) out.push(p);
  }
  return out;
}

describe('the Permissions-Policy header', () => {
  it('is set', () => { expect(policy).not.toBe(''); });

  it('allows the camera for the portal itself, and only itself, while the live camera is used', () => {
    const usesCamera = sources('src').some((f) => readFileSync(f, 'utf8').includes('getUserMedia('));
    expect(usesCamera).toBe(true);                    // the scanner exists; if it goes, revisit this
    expect(directive('camera')).toBe('camera=(self)');
  });

  it('keeps the microphone and location off', () => {
    expect(directive('microphone')).toBe('microphone=()');
    expect(directive('geolocation')).toBe('geolocation=()');
  });
});
