// src/lib/server/zip.test.js
import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { crc32, buildZip } from './zip.js';

// Walk STORE-method local file headers (no data descriptors) back into entries.
function parseLocalEntries(buf) {
  const entries = [];
  let p = 0;
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method   = buf.readUInt16LE(p + 8);
    const crc      = buf.readUInt32LE(p + 14);
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen  = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 30, p + 30 + nameLen);
    const dataStart = p + 30 + nameLen + extraLen;
    const data = Buffer.from(buf.subarray(dataStart, dataStart + compSize));
    entries.push({ name, data, crc, method });
    p = dataStart + compSize;
  }
  return entries;
}

describe('crc32', () => {
  it('matches the known vector for "hello"', () => {
    expect(crc32(Buffer.from('hello'))).toBe(0x3610a686);
  });
  it('is 0 for empty input', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('buildZip', () => {
  const entries = [
    { name: 'manifest.json', data: Buffer.from('{"ok":true}', 'utf8') },
    { name: 'files/GT-000001/report.bin', data: Buffer.from([0, 1, 2, 255, 128]) },
  ];

  it('produces a store-method archive with the right signatures', () => {
    const zip = buildZip(entries);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);          // first local header
    // End-of-central-directory record is the last 22 bytes.
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);           // total entries
  });

  it('round-trips names, data (verbatim) and CRCs', () => {
    const zip = buildZip(entries);
    const parsed = parseLocalEntries(zip);
    expect(parsed.map((e) => e.name)).toEqual(['manifest.json', 'files/GT-000001/report.bin']);
    for (let i = 0; i < entries.length; i++) {
      expect(parsed[i].method).toBe(0);                    // stored
      expect(parsed[i].data).toEqual(entries[i].data);     // verbatim bytes
      expect(parsed[i].crc).toBe(crc32(entries[i].data));  // header CRC correct
    }
  });

  it('handles an empty archive', () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22);                           // EOCD only
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
    expect(zip.readUInt16LE(10)).toBe(0);
  });
});
