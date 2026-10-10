// src/lib/utils/textScan/ocrReader.js
//
// The text reader (Tesseract.js), run in a worker on the phone (2026-10-10).
// ⛔ Every file it needs is served by the portal (ocrAssets.js) — the library's
// default is a CDN, and a CDN would mean a request off-site and no reading with
// no signal. Its own copy of the English data is kept in IndexedDB by the
// library; the service worker keeps the rest (`lh-ocr-…` cache).
//
// The library is imported only when a scan is first asked for, so a page that
// never scans never downloads it. One worker is kept for the page's life:
// starting one costs a second or two, a read a fraction of that.

import { OCR_BASE } from './ocrAssets.js';
import { scanProfile } from './scanMatch.js';
import { getLogger } from '#lib/utils/logger.js';

const logger = getLogger('ocrReader');

/** @type {Promise<any>|null} */
let workerP = null;

async function createReader() {
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${OCR_BASE}worker.min.js`,
    corePath: OCR_BASE,          // a directory: the worker picks the core this device can run
    langPath: OCR_BASE.replace(/\/$/, ''),
    gzip: true,
    // ⛔ A blob: worker would need `worker-src blob:` in the CSP; loading the
    // worker from our own URL needs nothing new.
    workerBlobURL: false,
  });
}

/** Start the reader (or return the one already started). */
export function startReader() {
  if (!workerP) workerP = createReader().catch((err) => { workerP = null; throw err; });
  return workerP;
}

/**
 * Read the text in a picture.
 * @param {HTMLCanvasElement|Blob} image
 * @param {string|import('./scanMatch.js').ScanProfile} profile
 * @param {{ wholePicture?: boolean }} [opts]  a whole photo rather than the guide box
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function readText(image, profile, { wholePicture = false } = {}) {
  const { charset } = scanProfile(profile);
  const worker = await startReader();
  await worker.setParameters({
    tessedit_char_whitelist: charset + ' ',
    // The guide box holds one line; a whole photo holds text anywhere.
    tessedit_pageseg_mode: wholePicture ? '11' : '7',
  });
  const { data } = await worker.recognize(image);
  return { text: data.text ?? '', confidence: data.confidence ?? 0 };
}

/**
 * Fetch the reader's files ahead of need, while there is a signal, so a scan
 * works in the basement later. Starts the reader and stops it again; the files
 * stay with the browser. Never throws — a failed warm-up only means the first
 * scan downloads them instead.
 */
export async function warmReader() {
  if (workerP) return;                 // a scan has already fetched them
  try {
    const w = await createReader();    // its own worker: a scan starting meanwhile keeps its own
    await w.terminate();
  } catch (/** @type {any} */ err) {
    logger('⚠ could not fetch the reader ahead of time:', err?.message ?? err);
  }
}
