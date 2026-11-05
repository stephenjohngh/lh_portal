// src/lib/apps/cases/public.js
//
// PUBLIC INTERFACE of the Cases app — what other apps may read from it.
// Other apps import from HERE and nowhere else inside `cases/`.
//
// ⛔ A case's title, description or fields may name a person. Nothing
// exported here returns them: a row names a case by its REFERENCE, its
// process and the step it is in.

import { api } from '#lib/utils/api.js';
import { listDeadlines } from '#lib/workflow/workflowApi.js';
import { isFinished } from '#lib/workflow/workflowModel.js';
import { today as todayISO } from '#lib/utils/dates.js';

/**
 * Every Cases process's deadlines, for the Planner (migration 253): each open
 * case whose step has a deadline, as set in Admin → Workflows. The date is the
 * workflow item's own `due_on`, never derived again here.
 *
 * Bounded at `to` only: a case past its deadline is overdue and stays in view.
 * RLS on workflows and items is gated on the `cases` grant, so without it this
 * returns nothing.
 *
 * @param {string|null} to  YYYY-MM-DD
 * @returns {Promise<Array<{ id: string, title: string, date: string, overdue: boolean }>>}
 */
export async function listCaseDueDates(to = null) {
  const today = todayISO();
  const processes = await api.getAll('workflows', { select: 'id, key', filters: { app_id: 'cases' }, orderBy: 'key' });
  const lists = await Promise.all(processes.map((p) => listDeadlines(p.key)));
  return lists.flat()
    .filter((d) => !to || d.due_on <= to)
    .map((d) => ({
      id: `case:${d.id}`,
      title: `${d.workflow} ${d.label ?? ''} — ${d.step}`.replace(/\s+—/, ' —'),
      date: d.due_on,
      overdue: d.due_on < today,
    }));
}

/**
 * The cases that name a component in one of their component fields, open first:
 * reference, process and step only (see the header). Every read is of the Cases
 * app's own rows, which RLS gates on the grant, so without it this returns nothing.
 *
 * @param {string} componentId
 * @returns {Promise<Array<{ id: string, reference: string, process: string, step: string, finished: boolean }>>}
 */
export async function listCasesForComponent(componentId) {
  return (await readCaseRows())
    .filter((c) => c.components.includes(componentId))
    .map(({ components, ...row }) => row)
    .sort((a, b) => Number(a.finished) - Number(b.finished) || b.reference.localeCompare(a.reference));
}

/**
 * Every open case that names a component, one row per case and component, for
 * the compliance position's open-fault band (2026-11-05). The same limits as
 * above: reference, process and step only, and nothing without the grant.
 *
 * @returns {Promise<Array<{ component_id: string, id: string, reference: string, process: string, step: string }>>}
 */
export async function listOpenCaseLinks() {
  return (await readCaseRows())
    .filter((c) => !c.finished)
    .flatMap(({ components, finished, ...row }) => components.map((component_id) => ({ component_id, ...row })));
}

/** Every case in a process with a component field, with the components it names. */
async function readCaseRows() {
  const processes = await api.getAll('workflows', { select: 'id, key, name', filters: { app_id: 'cases' }, orderBy: 'key' });
  if (!processes.length) return [];
  const ids = processes.map((p) => p.id);
  const fields = await api.getAllIn('workflow_fields', 'workflow_id', ids, { select: 'workflow_id, key', filters: { type: 'component' }, orderBy: 'key', tiebreak: false });
  const usable = new Set(fields.map((f) => f.workflow_id));
  if (!usable.size) return [];
  const [items, steps] = await Promise.all([
    api.getAllIn('workflow_items', 'workflow_id', [...usable], { select: 'id, workflow_id, step_key, label, fields' }),
    api.getAllIn('workflow_steps', 'workflow_id', [...usable], { select: 'workflow_id, key, name, kind', orderBy: 'key', tiebreak: false }),
  ]);
  const name = new Map(processes.map((p) => [p.id, p.name]));
  const stepOf = new Map(steps.map((s) => [`${s.workflow_id}>${s.key}`, s]));
  return items.map((i) => {
    const st = stepOf.get(`${i.workflow_id}>${i.step_key}`);
    const components = fields.filter((f) => f.workflow_id === i.workflow_id).map((f) => i.fields?.[f.key]).filter(Boolean);
    return { id: i.id, reference: i.label ?? '', process: name.get(i.workflow_id) ?? '', step: st?.name ?? i.step_key, finished: isFinished(st?.kind ?? ''), components };
  });
}
