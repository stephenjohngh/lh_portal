// src/routes/api/reports/generate-ten-year-plan/+server.js
// Renders the 10-Year Capital Plan Word document from the payload built by
// $lib/apps/maintenance/utils/planReport.js (buildPlanReportPayload). The endpoint is a
// pure renderer — all figures are computed client-side and posted here.
//
// POST body: the buildPlanReportPayload(...) object.
// Layout: a portrait section (basis, funding summary, expenditure by year,
// assumptions register) followed by a landscape appendix (year-by-year matrix).

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import {
  Document, Packer, Paragraph, Table, TableRow,
  HeadingLevel, WidthType, TableLayoutType,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import { fmtShortDate } from '$lib/utils/dates';
import {
  CONTENT_W, CONTENT_W_L, COLOURS, BORDERS,
  hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
} from '$lib/server/docxHelpers.js';

const logger = getLogger('generate-ten-year-plan');

// -- Currency -----------------------------------------------------------------
const gbp = (v) => '£' + Math.round(Number(v) || 0).toLocaleString('en-GB');
// Compact form for the narrow matrix cells: 50000 → £50k, 1200 → £1.2k.
function gbpK(v) {
  if (!v) return '·';
  if (v < 1000) return '£' + Math.round(v);
  const k = v / 1000;
  return '£' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
}
const fdate = (d) => (d ? fmtShortDate(d) : '—');

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const plan = await request.json();
    if (!plan || !Array.isArray(plan.years)) {
      return json({ error: 'Invalid plan payload' }, { status: 400 });
    }

    const buffer   = await Packer.toBuffer(_buildPlanDocument(plan));
    const today    = new Date().toISOString().split('T')[0];
    const filename = `10_Year_Capital_Plan_${today}.docx`;
    logger('✅ Generated', filename, buffer.length, 'bytes');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (err) {
    logger('❌', err.message);
    return json({ error: err.message }, { status: 500 });
  }
}

// ── Document assembly ─────────────────────────────────────────────────────────
// Exported (underscore-prefixed so SvelteKit permits a non-HTTP export in a
// +server route) so the docx assembly can be smoke-tested without an auth request.

export function _buildPlanDocument(plan) {
  const title = '10-Year Capital Plan';
  return new Document({
    styles: DOC_STYLES,
    sections: [
      {
        properties: pageProps(),
        headers: { default: makeHeader(title, plan.generatedAt, CONTENT_W) },
        footers: { default: makeFooter() },
        children: buildPortrait(plan),
      },
      {
        properties: pageProps({ landscape: true }),
        headers: { default: makeHeader(title, plan.generatedAt, CONTENT_W_L) },
        footers: { default: makeFooter() },
        children: buildAppendix(plan),
      },
    ],
  });
}

// ── Portrait section ──────────────────────────────────────────────────────────

function buildPortrait(plan) {
  const c = [];
  const window = `${plan.startYear}–${plan.endYear}`;
  const flagged = (plan.assumptions ?? []).filter(a => a.assets?.attention > 0).length;

  // Title block
  c.push(para('10-Year Capital Plan', { heading: HeadingLevel.HEADING_1 }));
  c.push(para(`${plan.building}  ·  ${window}  ·  Generated ${plan.generatedAt}`, { size: 18, color: COLOURS.textMuted, after: 240 }));

  // Basis
  c.push(para('Basis of the plan', { heading: HeadingLevel.HEADING_2 }));
  c.push(para(
    `This plan forecasts major capital renewal expenditure for ${plan.building} over ${plan.years.length} years, ` +
    `to support reserve (sinking) fund planning. Each figure is derived from an asset group's last renewal date ` +
    `and expected replacement life, costed at current-day estimates.`, { after: 120 }));
  c.push(para(
    'Figures are planning estimates, not quotations. No allowance for inflation, indexation, professional fees or ' +
    'contingency is included unless noted against a group. Renewal timing and asset condition are decision-support ' +
    'only — actual timing and expenditure remain a management decision. The plan should be reviewed at least ' +
    'annually and after any major works, survey or inspection.', { after: 120 }));
  if (flagged > 0) {
    c.push(para(
      `${flagged} group${flagged === 1 ? ' has' : 's have'} components currently flagged as problem or failed ` +
      '(shown in the register below). Consider whether their renewal should be brought forward.',
      { italics: true, color: COLOURS.warnAmber, after: 120 }));
  }

  // Funding summary
  c.push(para('Funding summary', { heading: HeadingLevel.HEADING_2 }));
  c.push(buildSummaryTable(plan));
  c.push(para(
    'The indicative contribution spreads total forecast spend evenly across the plan period (straight-line). ' +
    'It excludes any existing reserve balance, inflation and interest — set the actual contribution with professional advice.',
    { size: 15, italics: true, color: COLOURS.textMuted, before: 80, after: 120 }));

  // Expenditure by year
  c.push(para('Expenditure by year', { heading: HeadingLevel.HEADING_2 }));
  if (plan.byYear.length > 0) {
    c.push(buildByYearTable(plan));
  } else {
    c.push(para('No renewals fall within the plan window.', { italics: true, color: COLOURS.textMuted }));
  }

  // Assumptions & asset register
  c.push(para('Assumptions & asset register', { heading: HeadingLevel.HEADING_2 }));
  if (plan.assumptions.length > 0) {
    c.push(buildRegisterTable(plan));
  } else {
    c.push(para('No groups carry planning data yet.', { italics: true, color: COLOURS.textMuted }));
  }
  if (plan.incomplete.length > 0) {
    c.push(para(
      `Groups with planning data outside this window (not costed above): ${plan.incomplete.join(', ')}.`,
      { size: 15, color: COLOURS.textMuted, before: 80 }));
  }

  return c;
}

// Two-column label/value funding summary.
function buildSummaryTable(plan) {
  const W = [4200, 6266];
  const row = (label, value, alt) => new TableRow({ children: [
    dCell(label, W[0], { alt, bold: true }),
    dCell(value, W[1], { alt }),
  ]});
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: W,
    layout: TableLayoutType.FIXED,
    rows: [
      row(`Total forecast expenditure (${plan.startYear}–${plan.endYear})`, gbp(plan.grandTotal), false),
      row('Peak spend year', plan.peakYear ? `${plan.peakYear}  (${gbp(plan.peakSpend)})` : '—', true),
      row('Indicative annual reserve contribution', `${gbp(plan.avgPerYear)} per year`, false),
      row('Asset groups in plan', String(plan.groupCount), true),
    ],
  });
}

// Year | Planned renewals | Total
function buildByYearTable(plan) {
  const W = [1400, 7066, 2000];
  const header = new TableRow({ tableHeader: true, children: [
    hCell('Year', W[0]), hCell('Planned renewals', W[1]), hCell('Total', W[2]),
  ]});
  const rows = plan.byYear.map((y, i) => new TableRow({ children: [
    dCell(String(y.year), W[0], { alt: i % 2 === 1, bold: true }),
    dCell(y.items.map(it => `${it.name} (${gbp(it.amount)})`).join('  ·  '), W[1], { alt: i % 2 === 1 }),
    dCell(gbp(y.total), W[2], { alt: i % 2 === 1, align: 'right' }),
  ]}));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: W, layout: TableLayoutType.FIXED,
    rows: [header, ...rows],
  });
}

// Group | Assets & condition | Last renewal | Lifetime | Next renewal | Cost/cycle
function buildRegisterTable(plan) {
  const W = [2200, 2900, 1500, 900, 1500, 1466];
  const header = new TableRow({ tableHeader: true, children: [
    hCell('Group', W[0]), hCell('Assets & condition', W[1]), hCell('Last renewal', W[2]),
    hCell('Life (yr)', W[3]), hCell('Next renewal', W[4]), hCell('Cost / cycle', W[5]),
  ]});
  const rows = plan.assumptions.map((a, i) => {
    const alt = i % 2 === 1;
    return new TableRow({ children: [
      dCell(a.notes ? `${a.name}\n${a.notes}` : a.name, W[0], { alt, bold: true }),
      dCell(assetsLabel(a.assets), W[1], { alt, color: a.assets.attention > 0 ? COLOURS.warnAmber : undefined }),
      dCell(fdate(a.lastRenewal), W[2], { alt }),
      dCell(a.lifetimeYears != null ? String(a.lifetimeYears) : '—', W[3], { alt, align: 'center' }),
      dCell(fdate(a.nextRenewal), W[4], { alt }),
      dCell(a.costPerCycle != null ? gbp(a.costPerCycle) : '—', W[5], { alt, align: 'right' }),
    ]});
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: W, layout: TableLayoutType.FIXED,
    rows: [header, ...rows],
  });
}

function assetsLabel(a) {
  if (!a || a.manual) return 'Manual line';
  if (!a.total) return 'No live assets';
  const flags = [];
  if (a.failed)  flags.push(`${a.failed} failed`);
  if (a.problem) flags.push(`${a.problem} problem`);
  const base = `${a.total} component${a.total === 1 ? '' : 's'}`;
  return flags.length ? `${base} (${flags.join(', ')})` : base;
}

// ── Landscape appendix — the year-by-year matrix ──────────────────────────────

function buildAppendix(plan) {
  const c = [];
  c.push(para('Appendix A — Year-by-year forecast', { heading: HeadingLevel.HEADING_2 }));

  const years  = plan.years;
  const groupW = 2800, totalW = 1500;
  const yearW  = Math.max(700, Math.floor((CONTENT_W_L - groupW - totalW) / years.length));
  const W      = [groupW, ...years.map(() => yearW), totalW];

  const header = new TableRow({ tableHeader: true, children: [
    hCell('Asset group', groupW, { size: 15 }),
    ...years.map(y => hCell(String(y), yearW, { size: 15 })),
    hCell('Total', totalW, { size: 15 }),
  ]});

  const rows = plan.matrix.map((r, i) => {
    const alt = i % 2 === 1;
    return new TableRow({ children: [
      dCell(r.name, groupW, { alt, bold: true, size: 15 }),
      ...years.map(y => dCell(gbpK(r.byYear[y]), yearW, { alt, size: 15, align: 'right' })),
      dCell(gbp(r.total), totalW, { alt, size: 15, align: 'right', bold: true }),
    ]});
  });

  // Footer: annual total + cumulative reserve.
  const totalRow = new TableRow({ children: [
    dCell('Annual total', groupW, { fill: COLOURS.altRowFill, bold: true, size: 15 }),
    ...years.map(y => dCell(gbpK(plan.perYear[y]), yearW, { fill: COLOURS.altRowFill, bold: true, size: 15, align: 'right' })),
    dCell(gbp(plan.grandTotal), totalW, { fill: COLOURS.altRowFill, bold: true, size: 15, align: 'right' }),
  ]});
  const cumRow = new TableRow({ children: [
    dCell('Cumulative reserve', groupW, { size: 15, color: COLOURS.textMuted }),
    ...years.map(y => dCell(gbpK(plan.cumulative[y]), yearW, { size: 15, align: 'right', color: COLOURS.textMuted })),
    dCell('', totalW, {}),
  ]});

  c.push(new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    columnWidths: W, layout: TableLayoutType.FIXED,
    rows: [header, ...rows, totalRow, cumRow],
  }));

  c.push(para('Figures in £ thousands are abbreviated (e.g. £50k). Totals are exact.',
    { size: 15, italics: true, color: COLOURS.textMuted, before: 120 }));
  return c;
}
