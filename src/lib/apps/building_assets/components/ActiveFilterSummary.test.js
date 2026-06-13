// @vitest-environment jsdom
// src/lib/apps/building_assets/components/ActiveFilterSummary.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ActiveFilterSummary from './ActiveFilterSummary.svelte';

const systems = [{ id: 's1', name: 'Fire' }, { id: 's2', name: 'Electrical' }];
const types   = [{ id: 't1', code: 'door', name: 'Door' }];
beforeEach(cleanup);

describe('ActiveFilterSummary', () => {
  it('renders no pills when nothing is filtered', () => {
    const { container } = render(ActiveFilterSummary, { props: { systems, types } });
    expect(container.querySelectorAll('span').length).toBe(0);
  });

  it('shows the floor label pill for a non-"all" preset', () => {
    render(ActiveFilterSummary, { props: { floorPreset: 'residential', floorLabel: 'Residential (G–7)', systems, types } });
    expect(screen.getByText('Residential (G–7)')).toBeInTheDocument();
  });

  it('summarises system, type, status and search filters', () => {
    render(ActiveFilterSummary, {
      props: {
        filterSystemIds: new Set(['s1', 's2']),
        filterTypeCodes: new Set(['door']),
        filterStatuses:  new Set(['failed']),
        searchQuery: ' lift ',
        systems, types,
      },
    });
    expect(screen.getByText('System: Fire, Electrical')).toBeInTheDocument();
    expect(screen.getByText('Type: Door')).toBeInTheDocument();
    expect(screen.getByText('Status: failed')).toBeInTheDocument();
    expect(screen.getByText('"lift"')).toBeInTheDocument(); // trimmed
  });
});
