// @vitest-environment jsdom
// src/lib/utils/scrollParent.test.js

import { describe, it, expect, afterEach } from 'vitest';
import { scrollParent } from './revealElement.js';

/** jsdom lays nothing out, so the two measurements are stated outright. */
function sized(el, { scrollHeight, clientHeight }) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  return el;
}

function build(overflowY, sizes) {
  const box = document.createElement('div');
  box.style.overflowY = overflowY;
  sized(box, sizes);

  const child = document.createElement('p');
  box.appendChild(child);
  document.body.appendChild(box);
  return { box, child };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('scrollParent', () => {
  it('finds an ancestor that scrolls', () => {
    const { box, child } = build('auto', { scrollHeight: 800, clientHeight: 300 });
    expect(scrollParent(child)).toBe(box);
  });

  it('ignores a box that declares overflow but has nothing to scroll', () => {
    // The fault this exists for: the shared editor sits in a wrapper with
    // overflow set, and treating that as the scroller swallowed the scroll —
    // the code moved a container that could not move, and stopped looking, so
    // the window never scrolled and the match stayed off screen.
    const { child } = build('auto', { scrollHeight: 300, clientHeight: 300 });
    expect(scrollParent(child)).toBeNull();
  });

  it('ignores a box that does not scroll at all', () => {
    const { child } = build('hidden', { scrollHeight: 800, clientHeight: 300 });
    expect(scrollParent(child)).toBeNull();
  });

  it('says null when the window is what scrolls', () => {
    const loose = document.createElement('p');
    document.body.appendChild(loose);
    expect(scrollParent(loose)).toBeNull();
  });

  it('survives being handed nothing', () => {
    expect(scrollParent(null)).toBeNull();
  });
});
