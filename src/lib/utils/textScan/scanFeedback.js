// src/lib/utils/textScan/scanFeedback.js
//
// What the scanner says while it works (2026-10-10). Pure.
//
// Reported on a real phone: a plate that read easily answered in a few
// seconds, but one that did not left the screen unchanged — it looked hung.
// So the scanner always shows it is reading (a sweep in the box, the text it
// can see so far) and, the longer it goes without an answer, says what to try.

/**
 * The line under the picture.
 * @param {{ elapsedMs: number, seeing: string, matched: boolean, reading: string,
 *           torchAvailable: boolean, torchOn: boolean }} s
 *   elapsedMs — since the camera started, or since the last answer
 *   seeing    — what the latest frame read ('' for nothing)
 *   matched   — a known value is on offer
 *   reading   — a steady reading is on offer as "Use …"
 */
export function scanStatus({ elapsedMs, seeing, matched, reading, torchAvailable, torchOn }) {
  if (matched) return 'Tap the one that matches';
  if (reading) {
    return elapsedMs < 9000 ? 'Not one this screen knows yet — keep it in the box, or use what was read'
      : 'Still not one this screen knows — use what was read, or type it';
  }
  if (elapsedMs < 4000) return seeing ? 'Reading… hold it steady' : 'Looking… hold it inside the box';
  if (elapsedMs < 9000) {
    return seeing ? 'Still reading… keep it steady, and fill the box with it'
      : 'Still looking… move closer so it fills the box';
  }
  if (torchAvailable && !torchOn) return 'Still nothing clear — try Light on, or tilt to avoid glare';
  return 'Still nothing clear — try Take a photo, or type it';
}

/**
 * The state of the guide box frame: 'looking' (nothing read), 'seeing'
 * (characters read) or 'found' (a KNOWN value is on offer). Only a match is
 * found: a steady reading on no list may be half a plate, so the box keeps
 * sweeping and the hints keep coming (seen in the browser — a half plate went
 * green and still, and read as finished).
 * @param {{ seeing: string, matched: boolean, reading: string }} s
 */
export function boxState({ seeing, matched, reading }) {
  if (matched) return 'found';
  return seeing || reading ? 'seeing' : 'looking';
}
