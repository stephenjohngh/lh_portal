// src/lib/apps/inspection/utils/surveyLoad.js
//
// Reading a filled-in survey template and checking it before anything is saved
// (docs/requirements/unbuilt/Survey_Load_Spec.md §5). The survey arrived in the
// contractor's own format and was converted into our template by us; this is where
// a conversion error is caught.
//
// readSurveyWorkbook: the file → plain values (the only part that touches exceljs).
// checkSurvey:        those values + today's portal → refusals, warnings, and the
//                     rows survey_load() is given. Pure and tested.
//
// ⭐ Each row keeps its own date and time. A time left out is stored as midday and
// marked not recorded, so nothing later prints a time nobody noted.
// ⭐ Blank stays blank: a check not carried out is not stored, never a pass.
// ⭐ The Result is the surveyor's judgement and is never worked out from the checks.

import { calendarDate, londonInstant, today, fmtDateOnly, DAY_MS } from '#lib/utils/dates.js';
import { NO_ACCESS_REASONS, statusLabel } from '#lib/utils/resultConstants.js';
import { isReadingDef } from '#lib/apps/building_assets/lookups.js';
import { checkApplies } from '#lib/apps/building_assets/utils/checkApplies.js';
import { TEMPLATE_VERSION, NOT_APPLICABLE } from './resultsSheet.js';

const GIVEN = new Set(['ref', 'label', 'floor']);
const ENTRY = ['date', 'time', 'seen_by', 'result', 'no_access_reason', 'notes', 'source_ref'];
const RESULT_OF = { ok: 'ok', problem: 'problem', failed: 'failed', 'no access': 'no_access' };

/** A cell's plain value: a formula's result, rich text joined, text trimmed. */
export function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    return '';
  }
  return typeof v === 'string' ? v.trim() : v;
}

const blank = (v) => v === '' || v == null;
const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' from a date cell, typed text or an Excel serial; null if unreadable. */
export function readDate(v) {
  if (blank(v)) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : calendarDate(v.toISOString());
  if (typeof v === 'number') return calendarDate(new Date(Math.round((v - 25569) * DAY_MS)).toISOString());
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/** 'HH:MM' from a time cell (Excel time, fraction of a day, or typed); '' if blank, null if unreadable. */
export function readTime(v) {
  if (blank(v)) return '';
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number') {
    const mins = Math.round((v % 1) * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(String(v).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${pad(m[1])}:${m[2]}`;
}

/**
 * The workbook as plain values.
 * @param {ArrayBuffer|Uint8Array} buffer
 */
export async function readSurveyWorkbook(buffer) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  /** @type {Record<string, any>} */
  const survey = {};
  const sv = wb.getWorksheet('Survey');
  sv?.eachRow((row) => {
    const key = cellValue(row.getCell(3).value);
    if (key) survey[String(key)] = cellValue(row.getCell(2).value);
  });

  /** @type {Map<string, { id: string, ref: string, label: any, floor: any, sheet: string, fixed: any[] }>} */
  const components = new Map();
  wb.getWorksheet('Components')?.eachRow((row, n) => {
    if (n === 1) return;
    const vals = row.values.slice(1).map(cellValue);
    if (!vals[0]) return;
    components.set(String(vals[1]), { id: String(vals[0]), ref: String(vals[1]), label: vals[2], floor: vals[3], sheet: String(vals[4] ?? ''), fixed: vals.slice(5) });
  });

  const names = String(survey.results_sheets ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const sheets = names.map((name) => {
    const ws = wb.getWorksheet(name);
    if (!ws) return { name, missing: true, keys: [], rows: [] };
    const keys = ws.getRow(1).values.slice(1).map((k) => String(cellValue(k) ?? ''));
    const rows = [];
    for (let n = 3; n <= ws.rowCount; n++) {
      const values = ws.getRow(n).values;
      /** @type {Record<string, any>} */
      const cells = {};
      keys.forEach((k, i) => { if (k) cells[k] = cellValue(values[i + 1]); });
      rows.push({ rowNumber: n, cells });
    }
    return { name, missing: false, keys, rows };
  });

  return { survey, sheets, components };
}

/**
 * Check a read workbook against the portal as it is today.
 *
 * @param {Awaited<ReturnType<typeof readSurveyWorkbook>>} read
 * @param {{
 *   obligations: any[],                       planned obligations
 *   scopeIdsFor: (obligation: any) => Set<string>,
 *   componentById: Map<string, any>,           today's components
 *   defsFor: (component: any) => any[],        today's effective attributes for its type
 *   componentAttrs: Record<string, any[]>,
 *   heldSince?: (componentId: string) => string|null,   status_set_at today
 *   now?: Date,
 * }} ctx
 */
export function checkSurvey(read, ctx) {
  /** @type {Array<{ sheet?: string, row?: number, text: string }>} */
  const refusals = [];
  /** @type {string[]} */
  const warnings = [];
  const refuse = (text, sheet, row) => refusals.push({ text, sheet, row });
  const { survey } = read;
  const now = ctx.now ?? new Date();
  const todayIso = today(now);

  if (survey.template_version !== TEMPLATE_VERSION) {
    refuse(`This is not a portal survey template (expected ${TEMPLATE_VERSION}). Convert the survey into a template downloaded from the portal.`);
    return { refusals, warnings, rows: [], obligation: null, summary: null };
  }
  const obligation = ctx.obligations.find((o) => o.id === survey.obligation_id) ?? null;
  if (!obligation) {
    refuse('The planned obligation this template was made for no longer exists.');
    return { refusals, warnings, rows: [], obligation: null, summary: null };
  }
  if (blank(survey.firm)) refuse('Surveying firm is empty on the Survey sheet.');
  for (const s of read.sheets) if (s.missing) refuse(`The sheet "${s.name}" is missing.`);

  const inScope = ctx.scopeIdsFor(obligation);
  /** @type {any[]} */
  const rows = [];
  const seenDay = new Set();
  let failOnOk = 0, judgedWithoutFail = 0, emptyChecks = 0, missingReadings = 0;
  const labelDiffers = new Set();

  for (const sheet of read.sheets) {
    if (sheet.missing) continue;
    const checkKeys = sheet.keys.filter((k) => k && !GIVEN.has(k) && !ENTRY.includes(k) && !k.startsWith('fixed:'));
    const fixedKeys = sheet.keys.filter((k) => k.startsWith('fixed:'));
    let sheetDefs = null;

    for (const { rowNumber, cells } of sheet.rows) {
      const ref = String(cells.ref ?? '').trim();
      const entered = ENTRY.some((k) => !blank(cells[k]))
        || checkKeys.some((k) => !blank(cells[k]) && cells[k] !== NOT_APPLICABLE);
      if (!entered) continue;
      const here = (t) => refuse(t, sheet.name, rowNumber);

      if (!ref) { here('A row has results but no component.'); continue; }
      const listed = read.components.get(ref);
      if (!listed) { here(`${ref} is not a component in this template.`); continue; }
      const comp = ctx.componentById.get(listed.id);
      if (!comp) { here(`${ref} no longer exists in the portal.`); continue; }
      if (!inScope.has(comp.id)) { here(`${ref} is not covered by ${obligation.name}.`); continue; }

      const defs = ctx.defsFor(comp);
      sheetDefs ??= defs;
      const byId = new Map(defs.map((d) => [d.id, d]));

      // Date and time: the row's own.
      const date = readDate(cells.date);
      const time = readTime(cells.time);
      if (!date) { here(blank(cells.date) ? `${ref} has no date.` : `${ref}: "${cells.date}" is not a date.`); continue; }
      if (time === null) { here(`${ref}: "${cells.time}" is not a time.`); continue; }
      const at = londonInstant(date, time || '12:00');
      if (!at) { here(`${ref}: the date or time cannot be read.`); continue; }
      if (date > todayIso || at.getTime() > now.getTime() + DAY_MS / 24) { here(`${ref} is dated in the future (${fmtDateOnly(date)}).`); continue; }

      const resultWord = String(cells.result ?? '').trim().toLowerCase();
      const result = RESULT_OF[resultWord];
      if (!result) { here(blank(cells.result) ? `${ref} has no Result.` : `${ref}: Result "${cells.result}" is not OK, Problem, Failed or No access.`); continue; }

      let reason = null;
      if (result === 'no_access') {
        const r = NO_ACCESS_REASONS.find((x) => x.label.toLowerCase() === String(cells.no_access_reason ?? '').trim().toLowerCase());
        if (!r) { here(blank(cells.no_access_reason) ? `${ref} is No access with no reason.` : `${ref}: "${cells.no_access_reason}" is not a reason on the list.`); continue; }
        reason = r.value;
      } else if (!blank(cells.no_access_reason)) {
        here(`${ref} has a no-access reason but its Result is ${cells.result}.`); continue;
      }

      const dayKey = `${comp.id}|${date}`;
      if (seenDay.has(dayKey)) { here(`${ref} has two rows on ${fmtDateOnly(date)}. Keep one per day.`); continue; }
      seenDay.add(dayKey);

      /** @type {Record<string, boolean>} */
      const checklist = {};
      /** @type {Record<string, any>} */
      const readings = {};
      let bad = false, anyFail = false;
      for (const key of checkKeys) {
        const v = cells[key];
        const def = byId.get(key);
        if (!def || !def.checkable) {
          if (!blank(v) && v !== NOT_APPLICABLE) { here(`${ref}: a column names a check that no longer exists (${key}).`); bad = true; }
          continue;
        }
        const applies = checkApplies(def, comp, defs, ctx.componentAttrs);
        if (blank(v) || v === NOT_APPLICABLE) {
          if (result !== 'no_access' && applies) (isReadingDef(def) ? missingReadings++ : emptyChecks++);
          if (v === NOT_APPLICABLE && applies) warnings.push(`${ref}: ${def.name} is marked N/A, but it applies to this component. It is left as not recorded.`);
          continue;
        }
        if (result === 'no_access') { here(`${ref} is No access but ${def.name} is filled in.`); bad = true; continue; }
        if (!applies) { here(`${ref}: ${def.name} does not apply to this component.`); bad = true; continue; }
        if (isReadingDef(def)) {
          if (def.display_type === 'number') {
            // A number, optionally with a unit after it ("3", "3.5", "3mm"); never words.
            const m = typeof v === 'number' ? null : /^\s*(-?\d+(?:\.\d+)?)\s*[a-z%]*\s*$/i.exec(String(v));
            const n = typeof v === 'number' ? v : m ? Number(m[1]) : NaN;
            if (Number.isNaN(n)) { here(`${ref}: ${def.name} "${v}" is not a number.`); bad = true; continue; }
            readings[key] = n;
          } else readings[key] = String(v);
        } else {
          const w = String(v).trim().toLowerCase();
          if (w !== 'pass' && w !== 'fail') { here(`${ref}: ${def.name} "${v}" is not Pass or Fail.`); bad = true; continue; }
          checklist[key] = w === 'pass';
          if (w === 'fail') anyFail = true;
        }
      }
      if (bad) continue;

      if (anyFail && result === 'ok') failOnOk++;
      if ((result === 'failed' || result === 'problem') && !anyFail) judgedWithoutFail++;

      const todayFixed = fixedKeys.map((k) => {
        const def = byId.get(k.slice(6));
        return def ? ((ctx.componentAttrs[comp.id] ?? []).find((a) => a.type_attribute_id === def.id)?.value ?? def.default_value ?? '') : '';
      });
      if (String(listed.label ?? '') !== String(comp.label ?? '') || todayFixed.some((v, i) => String(v ?? '') !== String(listed.fixed[i] ?? ''))) labelDiffers.add(ref);

      rows.push({
        component_id: comp.id,
        ref,
        inspected_at: at.toISOString(),
        date,
        time_recorded: !!time,
        seen_by: blank(cells.seen_by) ? (survey.lead || null) : String(cells.seen_by),
        result,
        no_access_reason: reason,
        checklist_results: checklist,
        readings,
        notes: blank(cells.notes) ? null : String(cells.notes),
        source_ref: blank(cells.source_ref) ? null : String(cells.source_ref),
      });
    }

    // A check that applies to this type today but is not a column of the file.
    if (sheetDefs) {
      const added = sheetDefs.filter((d) => d.checkable && d.visible !== false && !checkKeys.includes(d.id));
      for (const d of added) warnings.push(`${d.name} was added after this template was made, so it is not recorded for ${sheet.name}.`);
    }
  }

  if (!rows.length && !refusals.length) refuse('No row has a result filled in.');

  // Status: a result changes a component's status only if it is newer than the one held.
  const newest = new Map();
  for (const r of rows) {
    if (r.result === 'no_access') continue;
    const prev = newest.get(r.component_id);
    if (!prev || prev.inspected_at < r.inspected_at) newest.set(r.component_id, r);
  }
  /** @type {Record<string, number>} */
  const changes = {};
  let older = 0;
  for (const [id, r] of newest) {
    const comp = ctx.componentById.get(id);
    const held = ctx.heldSince?.(id) ?? comp?.status_set_at ?? null;
    if (held && new Date(held).getTime() >= new Date(r.inspected_at).getTime()) { older++; continue; }
    if (comp?.status !== r.result) {
      const key = `${statusLabel(comp?.status)} → ${statusLabel(r.result)}`;
      changes[key] = (changes[key] ?? 0) + 1;
    }
  }

  const seen = new Set(rows.filter((r) => r.result !== 'no_access').map((r) => r.component_id));
  const noAccess = new Set(rows.filter((r) => r.result === 'no_access').map((r) => r.component_id));
  for (const id of seen) noAccess.delete(id);
  const notInFile = [...inScope].filter((id) => !rows.some((r) => r.component_id === id)).length;

  if (failOnOk) warnings.push(`${failOnOk} row${failOnOk === 1 ? ' has' : 's have'} a check marked Fail but a Result of OK.`);
  if (judgedWithoutFail) warnings.push(`${judgedWithoutFail} row${judgedWithoutFail === 1 ? ' is' : 's are'} Failed or Problem with no check marked Fail. The reason should be in Notes.`);
  if (labelDiffers.size) warnings.push(`${labelDiffers.size} component${labelDiffers.size === 1 ? '' : 's'} have a label or detail different from today's: ${[...labelDiffers].slice(0, 8).join(', ')}${labelDiffers.size > 8 ? '…' : ''}.`);
  if (older) warnings.push(`${older} result${older === 1 ? ' is' : 's are'} older than the status already held, so ${older === 1 ? 'it does' : 'they do'} not change it.`);
  if (emptyChecks) warnings.push(`${emptyChecks} check${emptyChecks === 1 ? ' was' : 's were'} left empty. They read as not recorded, never as a pass.`);
  if (missingReadings) warnings.push(`${missingReadings} reading${missingReadings === 1 ? ' was' : 's were'} not given.`);
  const untimed = rows.filter((r) => !r.time_recorded).length;
  if (untimed) warnings.push(`${untimed} row${untimed === 1 ? ' has' : 's have'} no time. ${untimed === 1 ? 'It is' : 'They are'} stored with the date only.`);

  const dates = rows.map((r) => r.date).sort();
  return {
    refusals,
    warnings,
    rows,
    obligation,
    summary: {
      rows: rows.length,
      days: new Set(dates).size,
      firstSeen: dates[0] ?? null,
      lastSeen: dates[dates.length - 1] ?? null,
      seen: seen.size,
      noAccess: noAccess.size,
      inScope: inScope.size,
      notInFile,
      statusChanges: changes,
    },
  };
}

/** The Survey sheet's details, as survey_load() takes them. @param {any} survey */
export function surveyDetails(survey) {
  const text = (v) => (blank(v) ? null : String(v));
  return {
    firm: text(survey.firm),
    lead_surveyor: text(survey.lead),
    reference: text(survey.survey_ref),
    note: text(survey.survey_notes),
    report_file: text(survey.report_file),
    template_version: survey.template_version,
    definition_id: survey.obligation_id,
  };
}
