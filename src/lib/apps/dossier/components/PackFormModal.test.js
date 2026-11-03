// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';

const PackFormModal = (await import('./PackFormModal.svelte')).default;

const issues = [
  { id: 'i1', issue_number: 12, name: 'Roof leak' },
  { id: 'i2', issue_number: null, name: 'Unnumbered' },
];
const templates = [{ id: 't1', title: 'Surveyor briefing' }];

beforeEach(() => cleanup());

describe('PackFormModal — create from a Management issue', () => {
  it('offers the issues as "#n — name" when there are any', () => {
    render(PackFormModal, { show: true, issues, templates: [] });
    expect(screen.getByText('Create from a Management issue (optional)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '#12 — Roof leak' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Unnumbered' })).toBeInTheDocument();
  });

  it('does not offer them when the person cannot read Management (no issues passed)', () => {
    render(PackFormModal, { show: true, issues: [], templates });
    expect(screen.queryByText('Create from a Management issue (optional)')).toBeNull();
  });

  it('is not offered when editing an existing pack', () => {
    render(PackFormModal, { show: true, issues, templates: [], pack: { id: 'p', title: 'x' } });
    expect(screen.queryByText('Create from a Management issue (optional)')).toBeNull();
  });

  it('lets an issue stand in for the title, and sends the issue id', async () => {
    let saved = null;
    render(PackFormModal, { props: { show: true, issues, templates: [] }, events: { save: (e) => { saved = e.detail; } } });
    await fireEvent.change(screen.getByLabelText('Create from a Management issue (optional)'), { target: { value: 'i1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create from issue' }));
    expect(saved.issueId).toBe('i1');
    expect(saved.title).toBe('');
  });

  it('refuses an empty title when no issue is chosen', async () => {
    let saved = null;
    render(PackFormModal, { props: { show: true, issues, templates: [] }, events: { save: (e) => { saved = e.detail; } } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Pack' }));
    expect(saved).toBeNull();
  });
});
