// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
// logger transitively imports $app/env, which does not resolve without SvelteKit.
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
const BlockContent = (await import('./BlockContent.svelte')).default;

const blocks = {
  type: 'doc',
  content: [{ type: 'asset', attrs: {
    document_id: 'd1', filename: 'Roof.jpg', mime_type: 'image/jpeg', provider_file_id: 'drive1',
  } }],
};

describe('a picture in a read-only page', () => {
  it('offers Expand beside Full size, and neither shows the file name', () => {
    const { container } = render(BlockContent, { blocks, mode: 'read' });
    expect(container.querySelector('a.dossier-asset-expand')).not.toBeNull();
    expect(container.querySelector('a.dossier-asset-fullsize')).not.toBeNull();
    expect(container.textContent).not.toContain('Roof.jpg');
  });

  it('Expand opens the picture in a pop-up, and Close shuts it', async () => {
    const { container } = render(BlockContent, { blocks, mode: 'read' });
    expect(screen.queryByTestId('lightbox')).toBeNull();
    await fireEvent.click(container.querySelector('a.dossier-asset-expand'));
    const box = screen.getByTestId('lightbox');
    expect(box.querySelector('img').getAttribute('src')).toContain('drive1');
    await fireEvent.click(screen.getByRole('button', { name: /close the enlarged picture/i }));
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });

  it('clicking the picture itself also enlarges it, and Escape closes the pop-up', async () => {
    const { container } = render(BlockContent, { blocks, mode: 'read' });
    await fireEvent.click(container.querySelector('img.dossier-asset-image'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });

  it('Full size still goes to a new tab, not the pop-up', async () => {
    const { container } = render(BlockContent, { blocks, mode: 'read' });
    const full = container.querySelector('a.dossier-asset-fullsize');
    expect(full.getAttribute('target')).toBe('_blank');
    await fireEvent.click(full);
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });
});
