// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { pickFiles, UPLOAD_PICKER_ID } from './pickFiles.js';

afterEach(() => { delete /** @type {any} */ (window).showOpenFilePicker; });

describe('pickFiles', () => {
  it('returns null where the browser has no remembering picker', async () => {
    expect(await pickFiles({ multiple: true })).toBeNull();
  });

  it('asks for the same remembered folder each time and returns the files', async () => {
    const f = new File(['x'], 'a.pdf');
    const pick = vi.fn(async () => [{ getFile: async () => f }]);
    /** @type {any} */ (window).showOpenFilePicker = pick;
    expect(await pickFiles({ multiple: true })).toEqual([f]);
    expect(pick).toHaveBeenCalledWith({ id: UPLOAD_PICKER_ID, multiple: true });
  });

  it('returns [] when the person cancels, so nothing falls through to a second chooser', async () => {
    /** @type {any} */ (window).showOpenFilePicker = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); };
    expect(await pickFiles()).toEqual([]);
  });

  it('falls back (null) when the picker fails for another reason', async () => {
    /** @type {any} */ (window).showOpenFilePicker = async () => { throw new Error('blocked'); };
    expect(await pickFiles()).toBeNull();
  });

  it('keeps the plain input for a restricted accept list', async () => {
    const pick = vi.fn();
    /** @type {any} */ (window).showOpenFilePicker = pick;
    expect(await pickFiles({ accept: 'image/*' })).toBeNull();
    expect(pick).not.toHaveBeenCalled();
  });
});
