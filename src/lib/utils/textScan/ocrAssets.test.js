// The reader's files are served from the portal (ocrAssets.js). If the list
// and the installed package part ways, the scanner fails on a phone with a
// 404 that no other test sees — these hold them together.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { OCR_VERSION, OCR_BASE, OCR_FILES } from './ocrAssets.js';

describe('the text reader’s files', () => {
  it('the version in the path is the installed tesseract.js', () => {
    const pkg = JSON.parse(readFileSync('node_modules/tesseract.js/package.json', 'utf8'));
    expect(OCR_VERSION).toBe(pkg.version);
    expect(OCR_BASE).toBe(`/ocr/v${pkg.version}/`);
  });

  it('every file listed exists', () => {
    for (const src of Object.values(OCR_FILES)) expect(existsSync(src), src).toBe(true);
  });

  it('publishes every LSTM core the worker may ask for', () => {
    // getCore.js picks one by what the device supports; a missing one is a
    // phone that cannot read.
    const getCore = readFileSync('node_modules/tesseract.js/src/worker-script/browser/getCore.js', 'utf8');
    const asked = [...getCore.matchAll(/(tesseract-core[\w-]*-lstm\.wasm\.js)/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(0);
    for (const name of asked) expect(Object.keys(OCR_FILES)).toContain(name);
  });

  it('the reader asks for the files under OCR_BASE, not a CDN', () => {
    const reader = readFileSync('src/lib/utils/textScan/ocrReader.js', 'utf8');
    for (const opt of ['workerPath', 'corePath', 'langPath']) expect(reader).toMatch(new RegExp(`${opt}:\s*[^,]*OCR_BASE`));
    expect(reader).toMatch(/workerBlobURL:\s*false/);
  });
});
