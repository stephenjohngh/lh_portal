// src/lib/apps/inspection/utils/resultsSheet.js
//
// Inspection results as a spreadsheet, in the same format a survey is loaded from
// (docs/requirements/unbuilt/Survey_Load_Spec.md §4 and §8). One row per result, one
// Results sheet per component type, because each type has its own checks.
//
// Everything comes from what was recorded: check names and wording from the result's
// set, the component from its snapshot. Hidden row 1 holds each column's id, so a
// file can be read back whatever a heading says.
//
// The model is pure and tested; buildResultsWorkbook only lays it out.

import { calendarDate, fmtDateOnly, fmtTime, fmtGenerated } from '#lib/utils/dates.js';
import { noAccessReasonLabel, statusLabel } from '#lib/utils/resultConstants.js';
import { isReadingDef } from '#lib/apps/building_assets/lookups.js';
import {
  recordedAnswers, recordedChecks, recordedComponent, sourceLabel, todaysNamesNote, withoutSnapshot,
} from './asRecorded.js';

export const TEMPLATE_VERSION = 'survey-template/1';

const resultWord = (r) => (r === 'no_access' ? 'No access' : statusLabel(r));
const passWord   = (p) => (p === true ? 'Pass' : p === false ? 'Fail' : '');
const seenBy     = (s) => s?.inspector_name ?? s?.inspector?.full_name ?? '';

/** Excel allows 31 characters, and not these. @param {string} name @param {Set<string>} taken */
function sheetName(name, taken) {
  const base = String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Results';
  let out = base;
  for (let n = 2; taken.has(out); n++) out = `${base} ${n}`;
  taken.add(out);
  return out;
}

/** @param {Array<{ session: any, rows: any[] }>} payloads @param {(code: string) => any} typeOf @param {(code: string) => any[]} defsOf */
function sheetsByType(payloads, typeOf, defsOf) {
  /** @type {Map<string, Array<{ session: any, row: any }>>} */
  const byType = new Map();
  for (const { session, rows } of payloads) {
    for (const row of rows) {
      const code = row.as_recorded?.component?.type_code ?? row.type_code ?? '';
      if (!byType.has(code)) byType.set(code, []);
      byType.get(code).push({ session, row });
    }
  }

  const taken = new Set();
  return [...byType.entries()].map(([code, items]) => {
    const type = typeOf(code);
    items.sort((a, b) => String(a.row.inspected_at).localeCompare(String(b.row.inspected_at)));

    // Columns by id, so a check reworded between two walks stays one column under
    // its newest name. Only what was asked or answered.
    /** @type {Map<string, any>} */
    const cols = new Map();
    /** @type {Map<string, string>} */
    const fixedCols = new Map();
    for (const { row } of items) {
      const { checks } = recordedChecks(row, defsOf(code));
      const answers = recordedAnswers(row, defsOf(code));
      const answered = new Set([...answers.conditions.filter((c) => c.passed !== null), ...answers.readings].map((a) => a.def.id));
      for (const def of checks) if (def.visible !== false || answered.has(def.id)) cols.set(def.id, def);
      for (const a of [...answers.conditions, ...answers.readings]) if (!cols.has(a.def.id)) cols.set(a.def.id, a.def);
      for (const f of recordedComponent(row)?.fixed ?? []) fixedCols.set(f.id, f.name);
    }
    const checkCols = [...cols.values()].sort((a, b) => (a.order ?? a.presentation_order ?? 999) - (b.order ?? b.presentation_order ?? 999));

    const columns = [
      { key: 'ref', heading: 'Component' }, { key: 'label', heading: 'Label' }, { key: 'floor', heading: 'Floor' },
      ...[...fixedCols].map(([id, name]) => ({ key: `fixed:${id}`, heading: `${name} on record` })),
      { key: 'date', heading: 'Date seen' }, { key: 'time', heading: 'Time' }, { key: 'seen_by', heading: 'Seen by' },
      { key: 'result', heading: 'Result' }, { key: 'no_access_reason', heading: 'If no access, why' },
      ...checkCols.map((d) => ({ key: d.id, heading: d.name })),
      { key: 'notes', heading: 'Notes' }, { key: 'source_ref', heading: 'Your reference' },
    ];

    const rows = items.map(({ session, row }) => {
      const comp = recordedComponent(row);
      const { conditions, readings } = recordedAnswers(row, defsOf(code));
      const passed = new Map(conditions.map((c) => [c.def.id, c.passed]));
      const values = new Map(readings.map((r) => [r.def.id, r.value]));
      const result = row.inspection_result ?? row.result;
      return [
        comp?.ref ?? `${row.floor_name ?? '?'}/${type?.initial ?? '?'}/${row.asset_id ?? row.label ?? '?'}`,
        comp?.label ?? row.label ?? '',
        comp?.floor_name ?? comp?.floor ?? row.floor_name ?? '',
        ...[...fixedCols.keys()].map((id) => comp?.fixed.find((f) => f.id === id)?.value ?? ''),
        calendarDate(row.inspected_at),
        fmtTime(row.inspected_at),
        seenBy(session),
        resultWord(result),
        result === 'no_access' ? noAccessReasonLabel(row.no_access_reason) : '',
        ...checkCols.map((d) => (isReadingDef(d) || values.has(d.id) ? values.get(d.id) ?? '' : passWord(passed.get(d.id)))),
        row.inspector_notes ?? '',
        row.source_ref ?? '',
      ];
    });

    const name = sheetName(items.length === rows.length && byType.size === 1 ? 'Results'
      : (recordedComponent(items[0].row)?.type_name ?? type?.name ?? code ?? 'Results'), taken);
    return { name, columns, rows, checks: checkCols, typeName: recordedComponent(items[0].row)?.type_name ?? type?.name ?? code };
  });
}

/**
 * @param {Array<{ session: any, rows: any[] }>} payloads  flattened rows with recorded_checks
 * @param {{ typeOf?: (code: string) => any, defsOf?: (code: string) => any[],
 *           obligationOf?: (id: string) => any, generatedAt?: string }} [lookups]
 */
export function resultsSheetModel(payloads, { typeOf = () => null, defsOf = () => [], obligationOf = () => null, generatedAt = fmtGenerated() } = {}) {
  const sessions = payloads.map((p) => p.session);
  const allRows  = payloads.flatMap((p) => p.rows);
  const one = (values) => { const s = [...new Set(values.filter(Boolean))]; return s.length === 1 ? s[0] : s.length ? 'Several' : ''; };
  const obligationIds = [...new Set(sessions.map((s) => s.definition_id).filter(Boolean))];

  const dates = allRows.map((r) => calendarDate(r.inspected_at)).filter(Boolean).sort();
  const note  = todaysNamesNote(withoutSnapshot(allRows));

  const survey = [
    ['Template version', TEMPLATE_VERSION],
    ['What this covers', one(sessions.map((s) => obligationOf(s.definition_id)?.name ?? s.session_name))],
    ['Planned obligation id', obligationIds.length === 1 ? obligationIds[0] : ''],
    ['Made by the portal', generatedAt],
    ['Source', one(sessions.map(sourceLabel))],
    ['Seen by', one(sessions.map(seenBy))],
    ['Dates', dates.length ? `${fmtDateOnly(dates[0])} to ${fmtDateOnly(dates[dates.length - 1])}` : ''],
    ['Results', String(allRows.length)],
    ...(note ? [['Please note', note]] : []),
  ];

  const sheets = sheetsByType(payloads, typeOf, defsOf);
  const seen = new Map();
  for (const r of allRows) {
    const c = recordedComponent(r);
    seen.set(r.component_id, [r.component_id, c?.ref ?? '', c?.label ?? r.label ?? '', c?.floor_name ?? r.floor_name ?? '']);
  }

  return { survey, sheets, components: [...seen.values()] };
}

/**
 * Lay the model out as a workbook, ready to save.
 * @param {ReturnType<typeof resultsSheetModel>} model
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildResultsWorkbook(model) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LH Portal';
  const NAVY = 'FF1E293B';
  const head = (row) => row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });

  const sv = wb.addWorksheet('Survey');
  sv.getColumn(1).width = 26; sv.getColumn(2).width = 70;
  for (const line of model.survey) {
    const r = sv.addRow(line);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.getRow(1).values = sheet.columns.map((c) => c.key);
    ws.getRow(1).hidden = true;
    ws.getRow(2).values = sheet.columns.map((c) => c.heading);
    ws.getRow(2).height = 44;
    head(ws.getRow(2));
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
    const dateCol = sheet.columns.findIndex((c) => c.key === 'date');
    const notesCol = sheet.columns.findIndex((c) => c.key === 'notes');
    sheet.columns.forEach((c, i) => { ws.getColumn(i + 1).width = i === notesCol ? 46 : Math.max(10, Math.min(18, String(c.heading).length + 2)); });
    sheet.rows.forEach((values, n) => {
      const row = ws.getRow(3 + n);
      values.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        if (i === dateCol && v) {
          cell.value = new Date(`${v}T00:00:00Z`);
          cell.numFmt = 'dd mmm yyyy';
        } else if (v !== '') cell.value = v;
        cell.alignment = { vertical: 'top', wrapText: i === notesCol };
      });
    });
  }

  const ck = wb.addWorksheet('Checks');
  ck.columns = [{ width: 18 }, { width: 28 }, { width: 16 }, { width: 90 }, { width: 38 }];
  head(ck.addRow(['Sheet', 'Check', 'How recorded', 'What it covers', 'Check id']));
  for (const sheet of model.sheets) {
    for (const d of sheet.checks) {
      const r = ck.addRow([sheet.name, d.name, isReadingDef(d) ? 'A reading' : 'Pass or Fail', d.help ?? d.help_notes ?? '', d.id]);
      r.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    }
  }

  const cp = wb.addWorksheet('Components', { state: 'hidden' });
  cp.addRow(['Component id', 'Component', 'Label', 'Floor']);
  for (const c of model.components) cp.addRow(c);

  return wb.xlsx.writeBuffer();
}
