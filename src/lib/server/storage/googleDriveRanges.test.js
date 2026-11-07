// src/lib/server/storage/googleDriveRanges.test.js
//
// A large file is read from Drive a range at a time, only as the reader takes it.

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', {}));
vi.mock('googleapis', () => ({ google: {} }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { driveFileInRanges, READ_PIECE_BYTES } = await import('./googleDriveProvider.js');

const token = async () => 'tok';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** A fake Drive that answers each Range from a file of `size` bytes. */
function drive(size, { failFrom = Infinity } = {}) {
  const asked = [];
  globalThis.fetch = vi.fn(async (_url, init) => {
    const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range);
    asked.push([Number(from), Number(to)]);
    if (Number(from) >= failFrom) return { status: 403 };
    const length = Number(to) - Number(from) + 1;
    return { status: 206, arrayBuffer: async () => new Uint8Array(length).fill(Number(from) % 251).buffer };
  });
  return asked;
}

describe('driveFileInRanges', () => {
  it('delivers every byte, in order, in ranges no larger than a piece', async () => {
    const size = READ_PIECE_BYTES * 2 + 5;
    const asked = drive(size);
    const reader = driveFileInRanges('f1', size, token).getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      expect(value[0]).toBe(total % 251);
      total += value.byteLength;
    }
    expect(total).toBe(size);
    expect(asked).toEqual([
      [0, READ_PIECE_BYTES - 1],
      [READ_PIECE_BYTES, READ_PIECE_BYTES * 2 - 1],
      [READ_PIECE_BYTES * 2, size - 1],
    ]);
  });

  it('does not read ahead of a reader who has stopped', async () => {
    const size = READ_PIECE_BYTES * 10;
    const asked = drive(size);
    const reader = driveFileInRanges('f1', size, token).getReader();
    await reader.read();
    await new Promise((r) => setTimeout(r, 20));
    expect(asked.length).toBeLessThanOrEqual(2);
  });

  it('breaks the download rather than ending it short', async () => {
    const size = READ_PIECE_BYTES * 2;
    drive(size, { failFrom: READ_PIECE_BYTES });
    const reader = driveFileInRanges('f1', size, token).getReader();
    await reader.read();
    await expect(reader.read()).rejects.toThrow('403');
  });
});
