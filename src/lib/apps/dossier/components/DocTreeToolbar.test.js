// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DocTreeToolbar from './DocTreeToolbar.svelte';

describe('DocTreeToolbar', () => {
  it('acts on the selected page', async () => {
    const doc = { id: 'p1', title: 'Overview' };
    const seen = [];
    render(DocTreeToolbar, { props: { doc, isAdmin: false }, events: {
      move: (e) => seen.push(['move', e.detail]),
      rename: (e) => seen.push(['rename', e.detail]),
    } });
    await fireEvent.click(screen.getByTitle('Indent'));
    await fireEvent.click(screen.getByTitle('Rename'));
    expect(seen).toEqual([['move', { node: doc, kind: 'indent' }], ['rename', doc]]);
  });
  it('is disabled with nothing selected, and says so', () => {
    render(DocTreeToolbar, { doc: null });
    expect(screen.getByTitle('Rename')).toBeDisabled();
    expect(screen.getByText('Select a page')).toBeInTheDocument();
  });
  it('shows Delete to admins only', () => {
    const { unmount } = render(DocTreeToolbar, { doc: { id: 'a' }, isAdmin: false });
    expect(screen.queryByTitle('Delete page')).toBeNull();
    unmount();
    render(DocTreeToolbar, { doc: { id: 'a' }, isAdmin: true });
    expect(screen.getByTitle('Delete page')).toBeInTheDocument();
  });
});
