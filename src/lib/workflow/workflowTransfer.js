// src/lib/workflow/workflowTransfer.js
//
// A workflow as ONE FILE, so a building can start from another's (roadmap §6,
// 2026-10-18 — "an app to deploy": a process set up in one portal should not
// be typed in again in the next). Pure.
//
// ⭐ The file holds the DEFINITION only — steps, moves, fields, the review mark
// — exactly what definitionOf() (workflowModel.js) keeps. Never an item, a name of a person, a
// value or the history: those are this building's, not the process's.
//
// Importing puts the file's definition in the EDITOR; it is checked and saved
// like any change (the review mark, the app's fixed parts, the database's own
// checks). A Cases process that is not here yet is set up from it; another
// app's workflow must already exist — its app sets it up — because a file
// cannot create what the app's code expects.

export const WORKFLOW_FILE_FORMAT = 'lh-portal-workflow';
export const WORKFLOW_FILE_VERSION = 1;

/**
 * The file for a workflow AS SAVED — its kept definition (definitionOf()),
 * never edits not yet saved.
 * @param {{ key: string, app_id: string }} wf
 * @param {any} definition  definitionOf(...) of what is saved
 * @param {string} exportedAt  an ISO timestamp
 */
export function workflowFile(wf, definition, exportedAt) {
  return { format: WORKFLOW_FILE_FORMAT, version: WORKFLOW_FILE_VERSION, exportedAt, key: wf.key, appId: wf.app_id, definition };
}

/** The file's name: the workflow's key and the day. @param {string} key @param {string} day */
export function workflowFileName(key, day) {
  return `workflow_${key.replace(/[^A-Za-z0-9_-]+/g, '_')}_${day}.json`;
}

const isObj = (/** @type {any} */ v) => v && typeof v === 'object' && !Array.isArray(v);
const isText = (/** @type {any} */ v) => typeof v === 'string' && v.trim() !== '';

/**
 * Read a workflow file, or throw saying what is wrong with it — in words for
 * the person who chose it.
 * @param {string} text
 * @returns {{ key: string, appId: string, definition: any }}
 */
export function readWorkflowFile(text) {
  let f;
  try { f = JSON.parse(text); } catch { throw new Error('That file is not a workflow file: it could not be read as one.'); }
  if (!isObj(f) || f.format !== WORKFLOW_FILE_FORMAT) throw new Error('That file is not a workflow file exported from the portal.');
  if (f.version !== WORKFLOW_FILE_VERSION) throw new Error(`That workflow file is version ${f.version}; this portal reads version ${WORKFLOW_FILE_VERSION}.`);
  const d = f.definition;
  if (!isText(f.key) || !isText(f.appId) || !isObj(d) || !isText(d.name) || !Array.isArray(d.steps) || !Array.isArray(d.moves)) {
    throw new Error('That workflow file is incomplete: it needs its key, its app, a name, steps and moves.');
  }
  for (const s of d.steps) {
    if (!isObj(s) || !isText(s.key) || !isText(s.name) || !isText(s.kind)) throw new Error('A step in that file has no key, name or kind.');
  }
  for (const m of d.moves) {
    if (!isObj(m) || !isText(m.from_key) || !isText(m.to_key) || !isText(m.label)) throw new Error('A move in that file has no from, to or button.');
  }
  if (d.fields != null && !Array.isArray(d.fields)) throw new Error('The fields in that file are not a list.');
  for (const fl of d.fields ?? []) {
    if (!isObj(fl) || !isText(fl.key) || !isText(fl.label) || !isText(fl.type)) throw new Error('A field in that file has no key, label or type.');
  }
  return { key: f.key, appId: f.appId, definition: { ...d, fields: d.fields ?? [] } };
}

/**
 * Where an imported workflow goes, or why it cannot.
 * @param {{ key: string, appId: string, definition: any }} file
 * @param {Array<{ key: string, app_id: string, name: string }>} workflows  those here now
 * @returns {{ into: string } | { newCases: true } | { refused: string }}
 */
export function importTarget(file, workflows) {
  const here = workflows.find((w) => w.key === file.key);
  if (here) {
    if (here.app_id !== file.appId) {
      return { refused: `That file is for a workflow of another app (${file.appId}); “${here.name}” here belongs to ${here.app_id}.` };
    }
    return { into: here.key };
  }
  if (file.appId === 'cases') return { newCases: true };
  return { refused: `There is no “${file.definition.name}” workflow here yet. Its app sets it up the first time an administrator opens it — open that app, then import again.` };
}
