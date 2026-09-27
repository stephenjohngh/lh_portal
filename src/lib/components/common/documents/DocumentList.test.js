// @vitest-environment jsdom
//
// src/lib/components/common/documents/DocumentList.test.js
// The list shows what Check files found (2026-09-27). ⛔ A checked-and-fine row
// carries a ✓, so an unmarked row can only mean "not checked".
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';

const DocumentList = (await import('./DocumentList.svelte')).default;

const doc = (id, name) => ({ id, display_name: name, folder_path: 'Info Notes', created_at: '2026-09-01' });

afterEach(cleanup);

describe('DocumentList — check results', () => {
  it('marks a fine row ✓, names the problems on a bad one, and leaves an unchecked one plain', () => {
    render(DocumentList, {
      props: {
        docs: [doc('a', 'fine.pdf'), doc('b', 'gone.odt'), doc('c', 'new.txt')],
        checks: {
          a: { owner: 'present', file: 'present' },
          b: { owner: 'missing', file: 'missing' },
        },
      },
    });
    const rowOf = (name) => /** @type {HTMLElement} */ (screen.getByText(name).closest('tr'));
    expect(within(rowOf('fine.pdf')).queryByTestId('check-ok')).not.toBeNull();
    expect(within(rowOf('fine.pdf')).queryByTestId('check-problems')).toBeNull();

    const bad = within(rowOf('gone.odt'));
    expect(bad.queryByTestId('check-ok')).toBeNull();
    expect(bad.getByText('File missing from storage')).toBeTruthy();
    expect(bad.getByText('The record it was attached to is deleted')).toBeTruthy();

    const unchecked = within(rowOf('new.txt'));
    expect(unchecked.queryByTestId('check-ok')).toBeNull();
    expect(unchecked.queryByTestId('check-problems')).toBeNull();
  });

  it('shows nothing extra when no check has been run', () => {
    render(DocumentList, { props: { docs: [doc('a', 'fine.pdf')] } });
    expect(screen.queryByTestId('check-ok')).toBeNull();
    expect(screen.queryByTestId('check-problems')).toBeNull();
  });
});
