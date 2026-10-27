// @vitest-environment jsdom
//
// The workflow diagram (2026-10-17). ⚠ 2026-10-20: it keyed its arrows by
// their from/to pair, so a workflow being edited with two moves on the same
// pair (the editor says that is a problem; it is still on screen meanwhile)
// threw and blanked the whole Admin page.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import WorkflowDiagram from './WorkflowDiagram.svelte';

const steps = [
  { key: 'a', name: 'Received', kind: 'start', position: 1 },
  { key: 'b', name: 'Checking', kind: 'open', position: 2 },
  { key: 'c', name: 'Done', kind: 'done', position: 3 },
];

describe('WorkflowDiagram', () => {
  it('draws a workflow with two moves on the same pair, both labelled', () => {
    const moves = [
      { from_key: 'a', to_key: 'b', label: 'Start' },
      { from_key: 'a', to_key: 'b', label: 'New move' },
      { from_key: 'b', to_key: 'c', label: 'Finish' },
    ];
    render(WorkflowDiagram, { steps, moves, title: 'Test — diagram' });
    const svg = screen.getByRole('img', { name: 'Test — diagram' });
    expect(svg.textContent).toContain('Start');
    expect(svg.textContent).toContain('Finish');
  });

  it('can be drawn at its own size or scaled to fit the window, and remembers the choice', async () => {
    const moves = [{ from_key: 'a', to_key: 'b', label: 'Start' }];
    try { localStorage.removeItem('workflow.diagramFit'); } catch { /* none */ }
    const { unmount } = render(WorkflowDiagram, { steps, moves, title: 'Fit — diagram' });
    const svg = () => screen.getByRole('img', { name: 'Fit — diagram' });
    const fixedWidth = svg().getAttribute('width');
    expect(fixedWidth).not.toBe('100%');
    await fireEvent.click(screen.getByTestId('workflow-diagram-fit'));
    expect(svg().getAttribute('width')).toBe('100%');
    expect(svg().getAttribute('viewBox')).toBeTruthy();     // so it scales, never crops
    unmount();
    render(WorkflowDiagram, { steps, moves, title: 'Fit — diagram' });
    expect(svg().getAttribute('width')).toBe('100%');         // remembered
    await fireEvent.click(screen.getByTestId('workflow-diagram-fit'));
    expect(svg().getAttribute('width')).toBe(fixedWidth);
  });
});
