// @vitest-environment jsdom
// The empty choice on an optional dropdown saves no value, so the type's default
// applies (replaceComponentAttributes skips ''). It must say WHICH default —
// "— none —" read as "no rating" on 71 apartment doors that were following one.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AttrField from './AttrField.svelte';

const options = ['Nominal FD60', 'FD60', 'Unknown'].map((value, i) => ({ id: `o${i}`, value, visible: true }));
const def = (over = {}) => ({ id: 'a1', name: 'Rating', display_type: 'dropdown', required: false, default_value: 'Nominal FD60', ...over });

describe('AttrField — the empty dropdown choice', () => {
  it('names the default when the type has one', () => {
    render(AttrField, { props: { def: def(), options, value: '' } });
    const blank = screen.getByRole('option', { name: 'Default — Nominal FD60' });
    expect(blank).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('option', { name: /none/ })).toBeNull();
  });

  it('still says none when there is no default', () => {
    render(AttrField, { props: { def: def({ default_value: null }), options, value: '' } });
    expect(screen.getByRole('option', { name: '— none —' })).toHaveValue('');
  });

  it('a value of its own is shown as that value, not the default', () => {
    render(AttrField, { props: { def: def(), options, value: 'FD60' } });
    expect(screen.getByRole('combobox')).toHaveValue('FD60');
  });

  it('a required dropdown offers no empty choice to pick', () => {
    render(AttrField, { props: { def: def({ required: true }), options, value: '' } });
    expect(screen.queryByRole('option', { name: /Default/ })).toBeNull();
    expect(screen.getByRole('option', { name: 'Select…' })).toBeDisabled();
  });
});
