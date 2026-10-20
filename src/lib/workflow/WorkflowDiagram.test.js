// @vitest-environment jsdom
//
// The workflow diagram (2026-10-17). ⚠ 2026-10-20: it keyed its arrows by
// their from/to pair, so a workflow being edited with two moves on the same
// pair (the editor says that is a problem; it is still on screen meanwhile)
// threw and blanked the whole Admin page.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
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
});
