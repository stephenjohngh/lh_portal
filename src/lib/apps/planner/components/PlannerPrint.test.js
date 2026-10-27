// @vitest-environment jsdom
//
// The month sheet (2026-10-27). A day with a very large number of items used to
// stretch its row past the page, and a month ran over onto further sheets (a
// 16-page print for twelve months). A cell now holds at most a fixed number of
// lines and counts the rest.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import PlannerPrint from './PlannerPrint.svelte';

const many = (n) => Array.from({ length: n }, (_, i) => ({
  event_id: `e${i}`, scheduled_for: '2026-02-02', date: '2026-02-02', status: 'due',
  series: { id: `e${i}`, title: `Item ${i + 1}`, category: null, all_day: true, recurrence: { freq: 'once' } },
}));

function sheet(n) {
  const { container } = render(PlannerPrint, { props: { year: 2026, layout: 'months', months: [2], occurrences: many(n), categories: [] } });
  return [...container.querySelectorAll('.print-month td')].find((td) => td.textContent.includes('Item 1'));
}

describe('PlannerPrint — month sheet', () => {
  it('lists every item when there are only a few', () => {
    const cell = sheet(5);
    expect(cell.querySelectorAll('.item').length).toBe(5);
    expect(cell.textContent).not.toContain('more');
  });

  it('caps a very busy day and says how many are not shown', () => {
    const cell = sheet(60);
    const lines = cell.querySelectorAll('.item');
    expect(lines.length).toBeLessThanOrEqual(8);               // seven items and the count
    expect(cell.textContent).toContain('+ 53 more');
    expect(cell.textContent).toContain('Item 1');
    expect(cell.textContent).not.toContain('Item 60');
  });

  it('holds a cell to its height, so no row can run past the page', () => {
    const css = readFileSync('src/lib/apps/planner/planner-print.css', 'utf8');
    expect(css).toMatch(/\.print-month \.day-body\s*\{[^}]*height:\s*\d+mm[^}]*overflow:\s*hidden/);
  });

  it('prints a day that does not exist much darker than a weekend', () => {
    const css = readFileSync('src/lib/apps/planner/planner-print.css', 'utf8');
    const grey = (sel) => parseInt(css.match(new RegExp(`${sel}\\s*\\{\\s*background:\\s*#([0-9a-f]{2})`))[1], 16);
    expect(grey('\\.print-year \\.weekend')).toBeGreaterThan(grey('\\.print-year \\.outside') + 60);
  });
});
