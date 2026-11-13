// @vitest-environment jsdom
// The location beside a component's details (2026-11-13): an unplaced
// component says so, a placed one is drawn on its own schematic, and a moved
// one is drawn again.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

const draw = vi.hoisted(() => vi.fn(async () => ({ placed: true })));
vi.mock('#lib/utils/planMarker.js', () => ({ drawComponentOnPlan: draw }));

import ComponentLocation from './ComponentLocation.svelte';

const plans = [{ id: 'p1', name: 'First floor', image_url: 'https://x/p1.png' }];
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

describe('ComponentLocation', () => {
  beforeEach(() => draw.mockClear());

  it('says an unplaced component is not on a schematic, and draws nothing', async () => {
    render(ComponentLocation, { component: { id: 'c1', schematic_id: null }, plans });
    await settle();
    expect(screen.getByText(/not on a floor schematic/)).toBeInTheDocument();
    expect(draw).not.toHaveBeenCalled();
  });

  it('draws a placed component on its schematic, and again when moved', async () => {
    const c = { id: 'c1', schematic_id: 'p1', x_position: 0.2, y_position: 0.3, label: 'Door 4' };
    const { rerender } = render(ComponentLocation, { component: c, plans, typeName: 'Fire door' });
    await settle();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0][1]).toEqual({ imageUrl: 'https://x/p1.png', x: 0.2, y: 0.3 });
    expect(screen.getByText(/First floor/)).toBeInTheDocument();

    rerender({ component: { ...c } });       // same place: no redraw
    await settle();
    expect(draw).toHaveBeenCalledTimes(1);

    rerender({ component: { ...c, x_position: 0.5 } });
    await settle();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('draws nothing while not active (a closed pop-up)', async () => {
    render(ComponentLocation, { component: { id: 'c1', schematic_id: 'p1', x_position: 0.1, y_position: 0.1 }, plans, active: false });
    await settle();
    expect(draw).not.toHaveBeenCalled();
  });
});
