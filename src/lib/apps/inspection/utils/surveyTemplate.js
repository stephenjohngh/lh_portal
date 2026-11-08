// src/lib/apps/inspection/utils/surveyTemplate.js
//
// The spreadsheet an outside surveyor fills in (docs/requirements/unbuilt/Survey_Load_Spec.md
// §4). Generated from one planned obligation: its scope gives the components, each
// type's own checks give the columns. The Results sheets use the same column ids as
// the results spreadsheet (resultsSheet.js), so a file filled in from this template
// and a file of results exported from the portal are read the same way.
//
// Sheets: Read me · Survey · one Results sheet per type · Example (never loaded) ·
// Checks · Components (hidden: each component's id and what is on record today, so a
// relabelled component still loads by its id).
//
// The model is pure and tested; buildSurveyTemplateWorkbook only lays it out.

import { fmtGenerated } from '#lib/utils/dates.js';
import { NO_ACCESS_REASONS } from '#lib/utils/resultConstants.js';
import { isReadingDef } from '#lib/apps/building_assets/lookups.js';
import { buildComponentRef } from '#lib/utils/componentRef.js';
import { isEmptyScope } from '#lib/apps/building_assets/utils/inspectionScope.js';
import { checkApplies, describeCondition } from '#lib/apps/building_assets/utils/checkApplies.js';
import { buildWalkComponentsFromScope } from './inspectionWalk.js';
import { TEMPLATE_VERSION, RESULT_WORDS, NOT_APPLICABLE, sheetName } from './resultsSheet.js';

export { NOT_APPLICABLE };

/** Rows left empty under the prefilled ones, for a second visit to a component. */
export const spareRowsFor = (n) => Math.min(200, Math.max(20, Math.ceil(n / 2)));

const orderOf = (d) => d.presentation_order ?? d.order ?? 0;
const PASS_FAIL = ['Pass', 'Fail'];

/**
 * @param {{
 *   obligation: any, components: any[], types: any[], floors: any[],
 *   attrDefs: Record<string, any[]>, componentAttrs: Record<string, any[]>,
 *   inspections?: any, generatedAt?: string,
 * }} input
 * @returns {{ ok: true, model: any } | { ok: false, reason: string }}
 */
export function surveyTemplateModel({
  obligation, components, types, floors, attrDefs, componentAttrs, inspections = {}, generatedAt = fmtGenerated(),
}) {
  if (!obligation) return { ok: false, reason: 'Choose a planned obligation.' };
  if (isEmptyScope(obligation.scope ?? {})) {
    return { ok: false, reason: 'This planned obligation has no scope, so there is nothing to survey. Set what it covers first.' };
  }
  const inScope = buildWalkComponentsFromScope(components ?? [], obligation.scope ?? {}, {
    types, attrDefs, componentAttrs, inspections,
  });
  if (!inScope.length) return { ok: false, reason: 'No component is in this planned obligation’s scope.' };

  const floorOf = new Map((floors ?? []).map((f) => [f.id, f]));
  const walkIndex = new Map(inScope.map((c, i) => [c.id, i]));
  const byFloorThenWalk = (a, b) =>
    (floorOf.get(a.floor_id)?.level_order ?? 999) - (floorOf.get(b.floor_id)?.level_order ?? 999)
    || walkIndex.get(a.id) - walkIndex.get(b.id);

  /** @type {Map<string, any[]>} */
  const byType = new Map();
  for (const c of inScope) {
    if (!byType.has(c.type_code)) byType.set(c.type_code, []);
    byType.get(c.type_code).push(c);
  }

  const taken = new Set();
  const single = byType.size === 1;
  const sheets = [...byType.entries()].map(([code, list]) => {
    const type = (types ?? []).find((t) => t.code === code) ?? null;
    const defs = (type ? attrDefs?.[type.id] : null) ?? [];
    const checks = defs.filter((d) => d.checkable && d.visible !== false).sort((a, b) => orderOf(a) - orderOf(b));
    const fixed  = defs.filter((d) => !d.checkable && d.visible !== false).sort((a, b) => orderOf(a) - orderOf(b));
    list.sort(byFloorThenWalk);

    const columns = [
      { key: 'ref', heading: 'Component', width: 11, given: true },
      { key: 'label', heading: 'Label', width: 9, given: true },
      { key: 'floor', heading: 'Floor', width: 14, given: true },
      ...fixed.map((d) => ({ key: `fixed:${d.id}`, heading: `${d.name} on record`, width: 14, given: true })),
      { key: 'date', heading: 'Date seen', width: 12 },
      { key: 'time', heading: 'Time (optional)', width: 10 },
      { key: 'seen_by', heading: 'Seen by', width: 16 },
      { key: 'result', heading: 'Result', width: 11 },
      { key: 'no_access_reason', heading: 'If no access, why', width: 17 },
      ...checks.map((d) => ({ key: d.id, heading: d.name, width: 11, check: d })),
      { key: 'notes', heading: 'Notes', width: 44 },
      { key: 'source_ref', heading: 'Your reference', width: 18 },
    ];

    const valueOf = (componentId, def) =>
      (componentAttrs?.[componentId] ?? []).find((a) => a.type_attribute_id === def.id)?.value ?? def.default_value ?? '';
    const rows = list.map((c) => ({
      componentId: c.id,
      ref: buildComponentRef(c, floors ?? [], types ?? []),
      label: c.label ?? '',
      floor: floorOf.get(c.floor_id)?.name ?? '',
      fixed: fixed.map((d) => ({ id: d.id, name: d.name, value: valueOf(c.id, d) ?? '' })),
      // Checks that do not apply to this component (migration 286).
      notApplicable: checks.filter((d) => !checkApplies(d, c, defs, componentAttrs)).map((d) => d.id),
    }));

    return {
      name: sheetName(single ? 'Results' : (type?.name ?? code), taken),
      typeCode: code,
      typeName: type?.name ?? code,
      columns,
      checks,
      rows,
      spare: spareRowsFor(rows.length),
    };
  });

  const survey = [
    { key: 'template_version', label: 'Template version', value: TEMPLATE_VERSION },
    { key: 'covers', label: 'What this covers', value: obligation.name ?? '' },
    { key: 'obligation_id', label: 'Planned obligation id', value: obligation.id },
    { key: 'made', label: 'Made by the portal', value: generatedAt },
    { key: 'results_sheets', label: 'Results sheets', value: sheets.map((s) => s.name).join(', ') },
    { key: 'firm', label: 'Surveying firm', value: '', ask: true },
    { key: 'survey_ref', label: 'Survey reference', value: '', ask: true },
    { key: 'lead', label: 'Lead surveyor', value: '', ask: true },
    { key: 'report_file', label: 'Report file name', value: '', ask: true },
    { key: 'survey_notes', label: 'Anything about the survey as a whole', value: '', ask: true },
  ];

  return {
    ok: true,
    model: {
      obligation: { id: obligation.id, name: obligation.name ?? '' },
      survey,
      sheets,
      readMe: readMeLines(obligation, sheets),
    },
  };
}

/** @param {any} obligation @param {any[]} sheets */
function readMeLines(obligation, sheets) {
  const many = sheets.length > 1;
  const hasReadings = sheets.some((s) => s.checks.some(isReadingDef));
  return [
    ['h1', `Survey results: ${obligation.name ?? 'inspection'}`],
    ['p', 'Use this spreadsheet to put a contractor’s survey into our records. Copy their findings across, one row for each visit to a component, then load it in the portal (Compliance → Inspection walks → Load a survey) with their report. Do not move, rename or delete sheets or columns.'],
    ['h2', 'What to fill in'],
    ['p', '1.  Survey sheet: the firm, their reference, the lead surveyor and their report’s file name.'],
    ['p', many
      ? `2.  Results sheets (${sheets.map((s) => s.name).join(', ')}): there is one row ready for each component. Fill in the yellow columns.`
      : '2.  Results sheet: there is one row ready for each component. Fill in the yellow columns.'],
    ['p', '3.  Their report is attached when you load this file, and kept with the results as the evidence.'],
    ['h2', 'For each component'],
    ['p', 'Date seen: the day they visited it. Time: from their report where it gives one, otherwise leave it empty and only the date is kept. Seen by: who visited, if the report says.'],
    ['p', 'Result: their overall finding, as OK, Problem, Failed or No access. Every visit needs one.'],
    ['p', 'Checks: Pass or Fail, only where their findings clearly answer what our check describes (the Checks sheet gives our wording). Anything they did not look at stays empty. Empty never counts as a pass.'],
    ...(hasReadings ? [['p', 'Readings: enter what you measured or saw. Where the heading gives a unit, use that unit.']] : []),
    ...(sheets.some((s) => s.rows.some((r) => r.notApplicable.length))
      ? [['p', `${NOT_APPLICABLE} in a check column means that check does not apply to that component. Leave it as it is.`]] : []),
    ['p', 'Notes: the reason for any Fail, and anything they found that is not one of our checks, in their words.'],
    ['p', 'Your reference: their job sheet number and report page, so a row can be traced back to the report and its photos.'],
    ['h2', 'If you could not get in'],
    ['p', 'Where they could not get in, choose No access as the Result and give a reason. Leave the checks and readings empty, because nothing was seen.'],
    ['h2', 'More than one visit'],
    ['p', 'Each visit on a different day is its own row, because each attempt counts. Use a spare row at the foot of a Results sheet and choose the component from the list in its first column. Two visits on one day need one row: keep the one that saw the component, if either did.'],
    ['p', 'The Example sheet shows finished rows. It is not loaded.'],
  ];
}

/** A few finished rows from the first sheet, for the Example sheet. @param {any} sheet */
export function exampleRows(sheet) {
  const pick = sheet.rows.slice(0, 3);
  const checkCols = sheet.columns.filter((c) => c.check);
  const reading = (d, n) => (d.display_type === 'number' ? 3 + n : 'As seen');
  const kinds = ['ok', 'failed', 'no_access'];
  return pick.map((r, n) => {
    const kind = kinds[n];
    const answers = new Map(checkCols.map((c, i) => {
      if (kind === 'no_access') return [c.key, ''];
      if (isReadingDef(c.check)) return [c.key, reading(c.check, n)];
      return [c.key, kind === 'failed' && i === 0 ? 'Fail' : 'Pass'];
    }));
    const failName = checkCols.find((c) => !isReadingDef(c.check))?.heading;
    const values = {
      ref: r.ref, label: r.label, floor: r.floor,
      date: '2027-10-04', time: ['10:15', '10:30', '10:40'][n], seen_by: 'A Surveyor',
      result: kind === 'ok' ? 'OK' : kind === 'failed' ? 'Failed' : 'No access',
      no_access_reason: kind === 'no_access' ? NO_ACCESS_REASONS[0].label : '',
      notes: kind === 'failed' ? `${failName ?? 'A check'} failed: say what was found.` : kind === 'no_access' ? 'Knocked twice.' : '',
      source_ref: `Sheet ${12 + n}, p.${12 + n}`,
    };
    return sheet.columns.map((c) => {
      if (c.key.startsWith('fixed:')) return r.fixed.find((f) => `fixed:${f.id}` === c.key)?.value ?? '';
      if (c.check) return r.notApplicable.includes(c.key) ? NOT_APPLICABLE : answers.get(c.key) ?? '';
      return values[c.key] ?? '';
    });
  });
}

/** Spreadsheet column letter for a 0-based index. */
export function columnLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Lay the model out as a workbook, ready to save.
 * @param {any} model  surveyTemplateModel(...).model
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildSurveyTemplateWorkbook(model) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portal';
  const NAVY = 'FF1E293B', YELLOW = 'FFFEF9C3', GREY = 'FFE2E8F0', WHITE = 'FFFFFFFF';
  const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const FIRST = 3;

  // ---- Read me
  const rm = wb.addWorksheet('Read me');
  rm.getColumn(1).width = 108;
  for (const [k, t] of model.readMe) {
    const r = rm.addRow([t]);
    r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(1).font = k === 'h1' ? { bold: true, size: 15 } : k === 'h2' ? { bold: true, size: 12 } : { size: 11 };
    r.height = k === 'p' ? (t.length > 105 ? (t.length > 210 ? 48 : 32) : 17) : 24;
  }

  // ---- Survey: hidden column C holds each line's key
  const sv = wb.addWorksheet('Survey');
  sv.getColumn(1).width = 34; sv.getColumn(2).width = 64; sv.getColumn(3).hidden = true;
  for (const line of model.survey) {
    const r = sv.addRow([line.label, line.value, line.key]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true };
    r.getCell(1).border = box; r.getCell(2).border = box;
    r.getCell(2).fill = fill(line.ask ? YELLOW : GREY);
  }

  // ---- Components (hidden): the id of each component, and what is on record today
  const cp = wb.addWorksheet('Components', { state: 'hidden' });
  // Columns F onwards hold the sheet's fixed details, in that sheet's column order.
  const mostFixed = Math.max(0, ...model.sheets.map((s) => s.columns.filter((c) => c.key.startsWith('fixed:')).length));
  cp.addRow(['Component id', 'Component', 'Label', 'Floor', 'Sheet',
    ...Array.from({ length: mostFixed }, (_, k) => `On record ${k + 1}`)]);
  /** @type {Map<string, { from: number, to: number }>} */
  const listRange = new Map();
  for (const sheet of model.sheets) {
    const from = cp.rowCount + 1;
    for (const r of sheet.rows) {
      cp.addRow([r.componentId, r.ref, r.label, r.floor, sheet.name, ...r.fixed.map((f) => f.value ?? '')]);
    }
    listRange.set(sheet.name, { from, to: cp.rowCount });
  }

  /** @param {any} ws @param {any} sheet @param {any[][]} rows @param {boolean} live */
  function results(ws, sheet, rows, live) {
    const cols = sheet.columns;
    ws.getRow(1).values = cols.map((c) => c.key);
    ws.getRow(1).hidden = true;
    const h = ws.getRow(2);
    h.values = cols.map((c) => c.heading);
    h.height = 44;
    h.eachCell((c) => {
      c.font = { bold: true, color: { argb: WHITE } }; c.fill = fill(NAVY);
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = box;
    });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
    const iDate = cols.findIndex((c) => c.key === 'date');
    const iNotes = cols.findIndex((c) => c.key === 'notes');
    const given = sheet.rows.length;
    const total = live ? given + sheet.spare : rows.length;
    for (let n = 0; n < total; n++) {
      const r = ws.getRow(FIRST + n);
      const values = rows[n] ?? [];
      cols.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        const v = values[i];
        if (i === iDate && v) { cell.value = new Date(`${v}T00:00:00Z`); }
        else if (v !== undefined && v !== '') cell.value = v;
        cell.border = box;
        cell.alignment = { vertical: 'top', wrapText: i === iNotes };
        const greyed = (c.given && (i > 0 || n < given)) || v === NOT_APPLICABLE;
        cell.fill = fill(greyed ? GREY : YELLOW);
        if (i === iDate) cell.numFmt = 'dd mmm yyyy';
      });
    }
    if (!live) return;

    const last = FIRST + total - 1;
    const range = (i) => `${columnLetter(i)}${FIRST}:${columnLetter(i)}${last}`;
    const list = (formula, title, msg) => ({ type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true, errorTitle: title, error: msg });
    const span = listRange.get(sheet.name);
    if (sheet.spare && span) {
      ws.dataValidations.add(`A${FIRST + given}:A${last}`,
        list(`Components!$B$${span.from}:$B$${span.to}`, 'Component', 'Choose a component from the list.'));
    }
    ws.dataValidations.add(range(iDate), { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2020, 0, 1))], showErrorMessage: true, errorTitle: 'Date seen', error: 'Enter a date.' });
    const iResult = cols.findIndex((c) => c.key === 'result');
    ws.dataValidations.add(range(iResult), list(`"${RESULT_WORDS.join(',')}"`, 'Result', 'Choose OK, Problem, Failed or No access.'));
    ws.dataValidations.add(range(iResult + 1), list(`"${NO_ACCESS_REASONS.map((r) => r.label).join(',')}"`, 'No access', 'Choose a reason from the list.'));
    cols.forEach((c, i) => {
      if (!c.check) return;
      if (!isReadingDef(c.check)) ws.dataValidations.add(range(i), list(`"${PASS_FAIL.join(',')}"`, c.heading, 'Choose Pass or Fail, or leave empty if it was not checked.'));
      else if (c.check.display_type === 'number') ws.dataValidations.add(range(i), { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [-1000000], showErrorMessage: true, errorTitle: c.heading, error: 'Enter a number.' });
    });

    // Spare rows fill in the given columns from the component chosen in column A.
    if (sheet.spare) {
      // Index into Components!B:…: B ref 1, C label 2, D floor 3, E sheet 4, F onwards fixed.
      const fixedKeys = cols.filter((c) => c.key.startsWith('fixed:')).map((c) => c.key);
      const lastCol = columnLetter(4 + Math.max(1, mostFixed));
      cols.forEach((c, i) => {
        if (!c.given || i === 0) return;
        const index = c.key === 'label' ? 2 : c.key === 'floor' ? 3 : 5 + fixedKeys.indexOf(c.key);
        for (let n = given; n < total; n++) {
          const row = FIRST + n;
          ws.getRow(row).getCell(i + 1).value = {
            formula: `IFERROR(VLOOKUP($A${row},Components!$B:$${lastCol},${index},FALSE),"")`, result: '',
          };
        }
      });
    }

    const checkIdx = cols.map((c, i) => (c.check ? i : -1)).filter((i) => i >= 0);
    if (checkIdx.length) {
      const area = `${columnLetter(checkIdx[0])}${FIRST}:${columnLetter(checkIdx[checkIdx.length - 1])}${last}`;
      ws.addConditionalFormatting({ ref: area, rules: [
        { type: 'expression', priority: 1, formulae: [`$${columnLetter(iResult)}${FIRST}="No access"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFCBD5E1' } } } },
        { type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"Fail"'], style: { font: { bold: true, color: { argb: 'FFB91C1C' } } } },
      ] });
    }
  }

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name);
    const prefilled = sheet.rows.map((r) => sheet.columns.map((c) => {
      if (c.key === 'ref') return r.ref;
      if (c.key === 'label') return r.label;
      if (c.key === 'floor') return r.floor;
      if (c.key.startsWith('fixed:')) return r.fixed.find((f) => `fixed:${f.id}` === c.key)?.value ?? '';
      if (c.check && r.notApplicable.includes(c.key)) return NOT_APPLICABLE;
      return '';
    }));
    results(ws, sheet, prefilled, true);
  }

  results(wb.addWorksheet('Example'), model.sheets[0], exampleRows(model.sheets[0]), false);

  const ck = wb.addWorksheet('Checks');
  ck.columns = [{ width: 18 }, { width: 26 }, { width: 16 }, { width: 80 }, { width: 30 }, { width: 38 }];
  const head = ck.addRow(['Sheet', 'Check', 'How to record', 'What it covers', 'Applies to', 'Check id']);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: WHITE } }; c.fill = fill(NAVY); });
  for (const sheet of model.sheets) {
    for (const d of sheet.checks) {
      const how = !isReadingDef(d) ? 'Pass or Fail' : d.display_type === 'number' ? 'A number' : 'Text';
      const r = ck.addRow([sheet.name, d.name, how, d.help_notes ?? d.help ?? '', describeCondition(d) || 'Every component', d.id]);
      r.getCell(4).alignment = { wrapText: true, vertical: 'top' };
      r.getCell(2).font = { bold: true };
    }
  }

  const order = ['Read me', 'Survey', ...model.sheets.map((s) => s.name), 'Example', 'Checks', 'Components'];
  order.forEach((n, i) => { wb.getWorksheet(n).orderNo = i; });
  return wb.xlsx.writeBuffer();
}

/** A file name for the download. @param {any} model @param {string} date */
export function surveyTemplateFilename(model, date) {
  const name = String(model.obligation.name || 'Survey').replace(/[^A-Za-z0-9 -]+/g, ' ').replace(/\s+/g, '_').slice(0, 60);
  return `Survey_Template_${name}_${date}.xlsx`;
}
