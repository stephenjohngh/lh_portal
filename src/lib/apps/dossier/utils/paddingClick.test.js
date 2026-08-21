// src/lib/apps/dossier/utils/paddingClick.test.js

import { describe, it, expect } from 'vitest';
import { shouldFocusEnd } from './paddingClick.js';

/** A plain click on the empty space below the last block. */
const aClick = {
  editable: true,
  onPadding: true,
  beganOnPadding: true,
  selectionCollapsed: true,
};

describe('shouldFocusEnd', () => {
  it('carries on writing when the padding is clicked', () => {
    expect(shouldFocusEnd(aClick)).toBe(true);
  });

  it('leaves a click on the text to ProseMirror', () => {
    // It places the cursor at the nearest position, which is the whole point of
    // the tall minimum height on the editor element.
    expect(shouldFocusEnd({ ...aClick, onPadding: false })).toBe(false);
  });

  it('does not treat a drag that LEFT through the padding as a click on it', () => {
    // The bug. A click fires on the common ancestor of press and release, so
    // selecting text and sweeping out through the 2rem side margin reports the
    // padding as the target — and the cursor jumped to the last line, taking
    // the selection with it.
    expect(shouldFocusEnd({ ...aClick, beganOnPadding: false })).toBe(false);
  });

  it('does not destroy a selection that began on the padding', () => {
    // The same fault mirrored: press in the margin, drag up into the text.
    expect(shouldFocusEnd({ ...aClick, selectionCollapsed: false })).toBe(false);
  });

  it('does nothing at all in read-only mode', () => {
    expect(shouldFocusEnd({ ...aClick, editable: false })).toBe(false);
  });
});
