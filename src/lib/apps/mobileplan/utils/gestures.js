// src/lib/apps/mobileplan/utils/gestures.js
// Pure touch gesture normaliser — no DOM or store dependencies.
// Returns { handleTouchStart, handleTouchMove, handleTouchEnd } event handlers.
//
// Gestures supported:
//   1-finger drag          → onPan(dx, dy)
//   2-finger pinch         → onZoom(scaleFactor, centerX, centerY)
//   Tap  (<200ms, <8px)    → onTap(x, y) — coords relative to target element
//   Double-tap (<300ms)    → onDoubleTap(x, y)
//   Long-press (>500ms)    → onLongPress(x, y) — fires on timeout, cancels if moved

const TAP_MAX_MS      = 200;
const TAP_MAX_TRAVEL  = 8;     // px
const DOUBLE_TAP_MS   = 300;   // max gap between two taps to count as double-tap
const LONG_PRESS_MS   = 500;   // hold duration
const LONG_PRESS_MOVE = 8;     // px — cancel long-press if finger moves this far

/**
 * @param {{
 *   onPan?:      (dx: number, dy: number) => void,
 *   onZoom?:     (factor: number, cx: number, cy: number) => void,
 *   onTap?:      (x: number, y: number, target: EventTarget) => void,
 *   onDoubleTap?:(x: number, y: number) => void,
 *   onLongPress?:(x: number, y: number, target: EventTarget) => void,
 * }} callbacks
 */
export function createGestureHandlers(callbacks = {}) {
  const { onPan, onZoom, onTap, onDoubleTap, onLongPress } = callbacks;

  // State for single-touch tracking
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchTarget = null;
  let longPressTimer = null;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  // State for pinch-zoom tracking
  let lastPinchDist = 0;
  let pinchActive = false;

  function dist(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function midpoint(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  function getRelativeCoords(element, clientX, clientY) {
    const rect = element.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchX   = t.clientX;
      lastTouchY   = t.clientY;
      touchStartX  = t.clientX;
      touchStartY  = t.clientY;
      touchStartTime = Date.now();
      touchTarget  = e.target;
      pinchActive  = false;

      // Schedule long-press
      cancelLongPress();
      if (onLongPress) {
        const capturedX = t.clientX;
        const capturedY = t.clientY;
        const capturedTarget = e.target;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          const rel = getRelativeCoords(e.currentTarget, capturedX, capturedY);
          onLongPress(rel.x, rel.y, capturedTarget);
        }, LONG_PRESS_MS);
      }

    } else if (e.touches.length === 2) {
      cancelLongPress();
      lastPinchDist = dist(e.touches[0], e.touches[1]);
      pinchActive   = true;
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length === 1 && !pinchActive) {
      const t = e.touches[0];
      const dx = t.clientX - lastTouchX;
      const dy = t.clientY - lastTouchY;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;

      // Cancel long-press if moved too far
      const travelX = t.clientX - touchStartX;
      const travelY = t.clientY - touchStartY;
      if (Math.sqrt(travelX * travelX + travelY * travelY) > LONG_PRESS_MOVE) {
        cancelLongPress();
      }

      if (onPan) onPan(dx, dy);

    } else if (e.touches.length === 2) {
      cancelLongPress();
      const newDist = dist(e.touches[0], e.touches[1]);
      if (lastPinchDist > 0 && onZoom) {
        const factor = newDist / lastPinchDist;
        const mid    = midpoint(e.touches[0], e.touches[1]);
        const rel    = getRelativeCoords(e.currentTarget, mid.x, mid.y);
        onZoom(factor, rel.x, rel.y);
      }
      lastPinchDist = newDist;
      pinchActive   = true;
    }
  }

  function handleTouchEnd(e) {
    cancelLongPress();

    if (pinchActive) {
      pinchActive   = false;
      lastPinchDist = 0;
      return;
    }

    if (e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const travelX = t.clientX - touchStartX;
      const travelY = t.clientY - touchStartY;
      const travel  = Math.sqrt(travelX * travelX + travelY * travelY);
      const elapsed = Date.now() - touchStartTime;

      if (elapsed < TAP_MAX_MS && travel < TAP_MAX_TRAVEL) {
        const rel     = getRelativeCoords(e.currentTarget, t.clientX, t.clientY);
        const now     = Date.now();
        const gapSinceLast = now - lastTapTime;
        const travelFromLast = Math.sqrt(
          (t.clientX - lastTapX) ** 2 + (t.clientY - lastTapY) ** 2
        );

        if (gapSinceLast < DOUBLE_TAP_MS && travelFromLast < TAP_MAX_TRAVEL * 3) {
          // Double-tap
          lastTapTime = 0; // reset so triple-tap doesn't fire again
          if (onDoubleTap) onDoubleTap(rel.x, rel.y);
        } else {
          // Single tap (fire immediately — no delay needed since double-tap
          // is detected on the second touchend, not speculatively)
          lastTapTime = now;
          lastTapX    = t.clientX;
          lastTapY    = t.clientY;
          if (onTap) onTap(rel.x, rel.y, touchTarget);
        }
      }
    }
  }

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}
