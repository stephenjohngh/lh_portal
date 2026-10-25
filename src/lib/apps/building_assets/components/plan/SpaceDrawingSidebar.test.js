// @vitest-environment jsdom
// The ID on the new-space panel (2026-10-23): typing it fills the label and name.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import SpaceDrawingSidebar from './SpaceDrawingSidebar.svelte';

const four = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.2 }, { x: 0.1, y: 0.2 }];
const idBox = () => /** @type {HTMLInputElement} */ (screen.getByLabelText(/^ID/));
const label = () => /** @type {HTMLTextAreaElement} */ (document.querySelector('textarea'));

describe('SpaceDrawingSidebar ID', () => {
  beforeEach(() => cleanup());

  it('has an ID box', () => {
    render(SpaceDrawingSidebar, { props: { vertices: four } });
    expect(idBox()).toBeTruthy();
  });

  it('typing the ID sets the label and the name to it, and Finish becomes available', async () => {
    let finished = 0;
    render(SpaceDrawingSidebar, { props: { vertices: four }, events: { finish: () => { finished++; } } });
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Finish' })).disabled).toBe(true);
    await fireEvent.input(idBox(), { target: { value: '12' } });
    expect(label().value).toBe('12');
    const name = screen.getAllByRole('textbox').find((e) => e.tagName === 'INPUT' && e !== idBox() && e.getAttribute('placeholder') !== null && e.id === '');
    expect(/** @type {HTMLInputElement} */ (name).value).toBe('12');
    const finish = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Finish' }));
    expect(finish.disabled).toBe(false);
    await fireEvent.click(finish);
    expect(finished).toBe(1);
  });

  it('the label can still be changed by hand afterwards', async () => {
    render(SpaceDrawingSidebar, { props: { vertices: four } });
    await fireEvent.input(idBox(), { target: { value: '12' } });
    await fireEvent.input(label(), { target: { value: 'Bay\n12' } });
    expect(label().value).toBe('Bay\n12');
    expect(idBox().value).toBe('12');
  });

  it('changing the ID again follows it', async () => {
    render(SpaceDrawingSidebar, { props: { vertices: four } });
    await fireEvent.input(idBox(), { target: { value: '12' } });
    await fireEvent.input(idBox(), { target: { value: '13' } });
    expect(label().value).toBe('13');
  });
});
