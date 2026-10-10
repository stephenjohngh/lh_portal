// src/lib/utils/textScan/ocrAssets.js
//
// The text reader's files (Tesseract.js), served from the portal itself rather
// than a CDN, so a photo is read on the phone and nothing leaves it (2026-10-10).
// ⛔ Imports nothing: vite.config.js reads this list to copy the files into the
// build (and serve them in dev), and the service worker reads OCR_BASE to keep
// them for use with no signal. One list, three readers.
//
// The version is in the path so an upgrade is a new URL: the service worker
// keeps these cache-first, for ever, and must never serve an old core to a new
// worker. ocrAssets.test.js fails if it drifts from the installed tesseract.js.

export const OCR_VERSION = '7.0.0';
export const OCR_BASE = `/ocr/v${OCR_VERSION}/`;

/**
 * Published file name → where it comes from, relative to the project root.
 * The worker picks ONE core by what the device supports (relaxed SIMD, SIMD,
 * neither); all three are published, a phone downloads one. LSTM-only cores
 * and the matching `best_int` English data are the smallest set that reads.
 */
export const OCR_FILES = {
  'worker.min.js':                          'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js':            'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js':       'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js':'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'eng.traineddata.gz':                     'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};
