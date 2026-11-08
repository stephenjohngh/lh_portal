// src/lib/server/zip.js
//
// Minimal ZIP archive writer — STORE method only (no compression). Building
// documents are already-compressed PDFs/images, so deflate buys little, and a
// store-only writer keeps us dependency-free (no jszip/archiver) and fully
// deterministic + unit-testable. 32-bit sizes (no ZIP64): fine for individual
// building documents. buildZip makes one in-memory Buffer (small text entries);
// zipStream writes as it goes, for anything that carries stored files.
//
// zipStream: the Golden Thread share pack and the Dossier pack archive.

import { Buffer } from 'node:buffer';

// CRC-32 (IEEE 802.3) — table-driven.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * CRC-32 of a byte buffer.
 * @param {Buffer|Uint8Array} buf
 * @returns {number} unsigned 32-bit
 */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time/date for a JS Date (2-second resolution). */
function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const year = Math.max(0, d.getFullYear() - 1980);
  const date = ((year & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time: time & 0xffff, date: date & 0xffff };
}

/**
 * Build a ZIP archive (STORE method) from entries.
 * @param {Array<{ name: string, data: Buffer|Uint8Array, date?: Date }>} entries
 * @returns {Buffer}
 */
export function buildZip(entries) {
  /** @type {Buffer[]} */ const local = [];
  /** @type {Buffer[]} */ const central = [];
  let offset = 0;

  for (const e of entries) {
    const data    = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc     = crc32(data);
    const { time, date } = dosDateTime(e.date ?? new Date());

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);   // local file header signature
    lfh.writeUInt16LE(20, 4);           // version needed to extract (2.0)
    lfh.writeUInt16LE(0x0800, 6);       // flags: bit 11 = UTF-8 filename
    lfh.writeUInt16LE(0, 8);            // method 0 = store
    lfh.writeUInt16LE(time, 10);
    lfh.writeUInt16LE(date, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18); // compressed size
    lfh.writeUInt32LE(data.length, 22); // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);           // extra field length
    local.push(lfh, nameBuf, data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);   // central directory header signature
    cdh.writeUInt16LE(20, 4);           // version made by
    cdh.writeUInt16LE(20, 6);           // version needed
    cdh.writeUInt16LE(0x0800, 8);       // flags
    cdh.writeUInt16LE(0, 10);           // method
    cdh.writeUInt16LE(time, 12);
    cdh.writeUInt16LE(date, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);           // extra length
    cdh.writeUInt16LE(0, 32);           // comment length
    cdh.writeUInt16LE(0, 34);           // disk number start
    cdh.writeUInt16LE(0, 36);           // internal attributes
    cdh.writeUInt32LE(0, 38);           // external attributes
    cdh.writeUInt32LE(offset, 42);      // local header offset
    central.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + data.length;
  }

  const centralBuf    = Buffer.concat(central);
  const centralOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);        // end of central directory signature
  eocd.writeUInt16LE(0, 4);                 // disk number
  eocd.writeUInt16LE(0, 6);                 // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);    // entries this disk
  eocd.writeUInt16LE(entries.length, 10);   // entries total
  eocd.writeUInt32LE(centralBuf.length, 12);// central dir size
  eocd.writeUInt32LE(centralOffset, 16);    // central dir offset
  eocd.writeUInt16LE(0, 20);                // comment length

  return Buffer.concat([...local, centralBuf, eocd]);
}

/** CRC-32 carried across pieces: start at 0xffffffff, finish with crc32Final. */
export function crc32Update(c, buf) {
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c;
}
export const crc32Final = (c) => (c ^ 0xffffffff) >>> 0;

const ZIP32_MAX = 0xffffffff;

/**
 * A ZIP archive (STORE method) written as it goes, so a large file passes through a
 * piece at a time instead of the whole archive being held in memory (2026-11-08).
 * Each file's CRC and size follow its bytes in a data descriptor (flag bit 3), which
 * every unzip tool reads. Entries come from an async iterable, so the caller can add
 * an entry built from what was streamed before it (the share pack's manifest).
 *
 * A failure part way ERRORS the stream: the download breaks rather than arriving as
 * an archive that is silently short. A caller opens each file before yielding it, so
 * an unreadable file is left out (and said so) before any of its bytes are written.
 *
 * @param {AsyncIterable<{ name: string, date?: Date, data: Uint8Array|AsyncIterable<Uint8Array> }>} entries
 * @returns {ReadableStream<Uint8Array>}
 */
export function zipStream(entries) {
  async function* parts() {
    /** @type {Buffer[]} */ const central = [];
    let offset = 0;
    let count = 0;
    for await (const e of entries) {
      const nameBuf = Buffer.from(e.name, 'utf8');
      const { time, date } = dosDateTime(e.date ?? new Date());
      const lfh = Buffer.alloc(30);
      lfh.writeUInt32LE(0x04034b50, 0);
      lfh.writeUInt16LE(20, 4);
      lfh.writeUInt16LE(0x0808, 6);       // bit 3: sizes in a data descriptor · bit 11: UTF-8 name
      lfh.writeUInt16LE(0, 8);
      lfh.writeUInt16LE(time, 10);
      lfh.writeUInt16LE(date, 12);
      lfh.writeUInt16LE(nameBuf.length, 26);
      yield lfh; yield nameBuf;

      let c = 0xffffffff;
      let size = 0;
      const pieces = e.data instanceof Uint8Array ? [e.data] : e.data;
      for await (const piece of pieces) {
        const buf = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
        c = crc32Update(c, buf);
        size += buf.length;
        if (size > ZIP32_MAX) throw new Error(`${e.name} is too large for this archive`);
        yield buf;
      }
      const crc = crc32Final(c);

      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crc, 4);
      dd.writeUInt32LE(size, 8);
      dd.writeUInt32LE(size, 12);
      yield dd;

      const cdh = Buffer.alloc(46);
      cdh.writeUInt32LE(0x02014b50, 0);
      cdh.writeUInt16LE(20, 4);
      cdh.writeUInt16LE(20, 6);
      cdh.writeUInt16LE(0x0808, 8);
      cdh.writeUInt16LE(time, 12);
      cdh.writeUInt16LE(date, 14);
      cdh.writeUInt32LE(crc, 16);
      cdh.writeUInt32LE(size, 20);
      cdh.writeUInt32LE(size, 24);
      cdh.writeUInt16LE(nameBuf.length, 28);
      cdh.writeUInt32LE(offset, 42);
      central.push(cdh, nameBuf);

      offset += lfh.length + nameBuf.length + size + dd.length;
      if (offset > ZIP32_MAX) throw new Error('the archive is too large');
      count++;
    }
    const centralBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(count, 8);
    eocd.writeUInt16LE(count, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    yield centralBuf; yield eocd;
  }
  const it = parts();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close(); else controller.enqueue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      } catch (err) { controller.error(err); }
    },
    async cancel() { await it.return?.(undefined); },
  });
}
