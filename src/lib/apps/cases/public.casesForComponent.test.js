import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ processes: [], fields: [], items: [], steps: [] }));
vi.mock('#lib/utils/api.js', () => ({ api: {
  getAll: async () => h.processes,
  getAllIn: async (/** @type {string} */ table) => ({ workflow_fields: h.fields, workflow_items: h.items, workflow_steps: h.steps })[table],
} }));
vi.mock('#lib/workflow/workflowApi.js', () => ({ listDeadlines: async () => [] }));

import { listCasesForComponent, listOpenCaseLinks } from './public.js';

beforeEach(() => {
  h.processes = [{ id: 'w', key: 'k', name: 'Fire door defect' }];
  h.fields = [{ workflow_id: 'w', key: 'door' }];
  h.steps = [{ workflow_id: 'w', key: 'open', name: 'Assess', kind: 'start' }, { workflow_id: 'w', key: 'done', name: 'Closed', kind: 'done' }];
  h.items = [
    { id: 'i1', workflow_id: 'w', step_key: 'done', label: 'CAS-1', fields: { door: 'a' } },
    { id: 'i2', workflow_id: 'w', step_key: 'open', label: 'CAS-2', fields: { door: 'a', title: 'Flat 12a owner' } },
    { id: 'i3', workflow_id: 'w', step_key: 'open', label: 'CAS-3', fields: { door: 'b' } },
  ];
});

describe('listCasesForComponent', () => {
  it('finds the cases naming this component, open first', async () => {
    const rows = await listCasesForComponent('a');
    expect(rows.map((r) => r.reference)).toEqual(['CAS-2', 'CAS-1']);
    expect(rows[0]).toMatchObject({ process: 'Fire door defect', step: 'Assess', finished: false });
  });
  it('⛔ says nothing a case holds beyond its reference, process and step', async () => {
    const [row] = await listCasesForComponent('a');
    expect(Object.keys(row).sort()).toEqual(['finished', 'id', 'process', 'reference', 'step']);
  });
  it('is empty without the grant, because RLS returns no processes', async () => {
    h.processes = [];
    expect(await listCasesForComponent('a')).toEqual([]);
  });
});

describe('listOpenCaseLinks', () => {
  it('lists open cases by the component they name, and no finished case', async () => {
    const rows = await listOpenCaseLinks();
    expect(rows.map((r) => [r.component_id, r.reference]).sort()).toEqual([['a', 'CAS-2'], ['b', 'CAS-3']]);
  });
  it('⛔ says nothing a case holds beyond its reference, process and step', async () => {
    const [row] = await listOpenCaseLinks();
    expect(Object.keys(row).sort()).toEqual(['component_id', 'id', 'process', 'reference', 'step']);
  });
  it('is empty without the grant', async () => {
    h.processes = [];
    expect(await listOpenCaseLinks()).toEqual([]);
  });
});
