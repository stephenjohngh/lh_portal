// src/lib/utils/jpegPdf.js
// A one-page A4 PDF holding one JPEG that fills the page. Pure, no library.
//
// Written for the parking permit (2026-10-06): the permit is drawn on a canvas,
// and a PDF prints at the right size from anything, where a bare image prints
// at whatever size the viewer guesses. A PDF that holds a single JPEG is a
// small fixed structure — JPEG data goes in as-is (/DCTDecode) — so a whole
// library for it would be weight with no use.
//
// Imports nothing, so the browser and a test share it.

const A4 = Object.freeze({ w: 595.28, h: 841.89 });   // points

const enc = new TextEncoder();

/**
 * @param {Uint8Array} jpeg     JPEG file bytes (baseline or progressive, RGB)
 * @param {number} widthPx      the JPEG's pixel width
 * @param {number} heightPx     the JPEG's pixel height
 * @param {{ title?: string }} [opts]
 * @returns {Uint8Array}        the PDF file
 */
export function jpegToPdf(jpeg, widthPx, heightPx, opts = {}) {
  return jpegsToPdf([{ jpeg, widthPx, heightPx }], opts);
}

/**
 * Several A4 pages, each one JPEG filling it (a guidebook drawn page by page on a canvas).
 * @param {Array<{ jpeg: Uint8Array, widthPx: number, heightPx: number }>} pages
 * @param {{ title?: string }} [opts]
 * @returns {Uint8Array}
 */
export function jpegsToPdf(pages, opts = {}) {
  if (!pages.length) throw new Error('jpegsToPdf: no pages');
  for (const { jpeg, widthPx, heightPx } of pages) {
    if (!(jpeg instanceof Uint8Array) || jpeg.length < 4 || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) {
      throw new Error('jpegToPdf: not a JPEG');
    }
    if (!(widthPx > 0) || !(heightPx > 0)) throw new Error('jpegToPdf: the image size is missing');
  }

  const content = enc.encode(`q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q
`);
  const title = pdfString(opts.title ?? '');
  // Objects: 1 catalog, 2 pages, then page / image / content for each page, then Info.
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');

  /** @type {(string|Uint8Array)[][]} one entry per object, its parts in order */
  const objects = [
    [`<< /Type /Catalog /Pages 2 0 R >>`],
    [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`],
  ];
  pages.forEach(({ jpeg, widthPx, heightPx }, i) => {
    const page = 3 + i * 3;
    objects.push(
      [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
        `/Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`],
      [`<< /Type /XObject /Subtype /Image /Width ${Math.round(widthPx)} /Height ${Math.round(heightPx)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>
stream
`,
        jpeg, `
endstream`],
      [`<< /Length ${content.length} >>
stream
`, content, `endstream`],
    );
  });
  objects.push([`<< /Title ${title} >>`]);

  /** @type {Uint8Array[]} */
  const chunks = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // "binary file" marker
  const offsets = [];
  objects.forEach((parts, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    for (const p of parts) push(p);
    push(`\nendobj\n`);
  });

  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) push(`${String(o).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`);
  push(`startxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** A PDF literal string: ASCII only, with ( ) \ escaped. */
function pdfString(s) {
  const ascii = String(s).replace(/[^\x20-\x7E]/g, '?');
  return `(${ascii.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}
