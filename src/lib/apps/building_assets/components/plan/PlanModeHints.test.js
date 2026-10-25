// @vitest-environment jsdom
// The Freeform / Rectangle choice and the hint that follows it (2026-10-23).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PlanModeHints from './PlanModeHints.svelte';

describe('PlanModeHints — drawing a space', () => {
  beforeEach(() => cleanup());

  it('offers Freeform and Rectangle, Freeform first, and says to click for freeform', () => {
    render(PlanModeHints, { props: { drawingMode: 'space' } });
    const free = /** @type {HTMLInputElement} */ (screen.getByLabelText('Freeform'));
    const rect = /** @type {HTMLInputElement} */ (screen.getByLabelText('Rectangle'));
    expect(free.checked).toBe(true);
    expect(rect.checked).toBe(false);
    expect(document.body.textContent).toMatch(/click a blank area to draw a new space/);
  });

  it('choosing Rectangle changes the text to pressing and dragging', async () => {
    render(PlanModeHints, { props: { drawingMode: 'space' } });
    await fireEvent.click(screen.getByLabelText('Rectangle'));
    expect(document.body.textContent).toMatch(/press on a blank area and drag to the opposite corner/);
    expect(document.body.textContent).not.toMatch(/click a blank area to draw a new space/);
  });

  it('a drawn rectangle says to fill in the details and Finish, or drag again', () => {
    const four = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.2 }, { x: 0.1, y: 0.2 }];
    render(PlanModeHints, { props: { drawingMode: 'space', spaceShape: 'rectangle', drawingVertices: four } });
    expect(document.body.textContent).toMatch(/Rectangle drawn/);
    expect(document.body.textContent).toMatch(/drag again to redraw/);
  });

  it('the choice is not shown in other modes', () => {
    render(PlanModeHints, { props: { drawingMode: 'component' } });
    expect(screen.queryByLabelText('Rectangle')).toBeNull();
  });
});
