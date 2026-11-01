// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PageTreeList from './PageTreeList.svelte';

const docs = [
  { id: 'a', title: 'Overview', slug: 'overview', order_index: 0, parent_doc_id: null },
  { id: 'a1', title: 'Roof', slug: 'roof', order_index: 0, parent_doc_id: 'a' },
  { id: 'b', title: 'Costs', slug: 'costs', order_index: 1, parent_doc_id: null },
];

describe('PageTreeList', () => {
  it('shows pages as a tree, children after their parent', () => {
    render(PageTreeList, { docs });
    const rows = screen.getAllByTestId('page-row').map(r => r.textContent.trim());
    expect(rows[0]).toContain('Overview');
    expect(rows[1]).toContain('Roof');
    expect(rows[2]).toContain('Costs');
  });
  it('picks a page, but not the excluded one', async () => {
    const pick = vi.fn();
    render(PageTreeList, { props: { docs, excludeId: 'a' }, events: { pick } });
    await fireEvent.click(screen.getByText('Overview'));
    expect(pick).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByText('Roof'));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('this page')).toBeInTheDocument();
  });
  it('searching shows a match with its parent', () => {
    render(PageTreeList, { docs, search: 'roof' });
    expect(screen.getByText('in Overview')).toBeInTheDocument();
    expect(screen.queryByText('Costs')).toBeNull();
  });
});
