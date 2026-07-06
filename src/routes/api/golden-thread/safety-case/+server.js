// POST /api/golden-thread/safety-case
// Render the Safety Case summary model (built client-side by gtSafetyCase.js,
// the same shape shown on-screen) into a Word document. Caller-supplied data
// only — no DB reads here — so the document mirrors the view exactly.
// Authenticated GT users; it is a formatted view of what they can already see.

import { json } from '@sveltejs/kit';
import { Document, Packer, Table, TableRow, WidthType } from 'docx';
import { requireAuth } from '$lib/server/requireAuth';
import {
  para, hCell, dCell, makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, COLOURS, BORDERS,
} from '$lib/server/docxHelpers.js';
import { REVIEW_BAND_LABEL } from '$lib/apps/golden_thread/utils/gtConstants.js';
import { getLogger } from '$lib/utils/logger';
import { fmtDate, fmtDateTime } from '$lib/utils/dates';

const logger = getLogger('GtSafetyCase');

function docTable(headers, widths, rows) {
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => hCell(h, widths[i])),
  });
  const body = rows.map((r, ri) => new TableRow({
    children: r.map((cell, i) => dCell(cell, widths[i], { alt: ri % 2 === 1 })),
  }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    borders: BORDERS,
    rows: [head, ...body],
  });
}

function bandText(band) {
  return band ? (REVIEW_BAND_LABEL[band] ?? band) : '—';
}

function buildContent(m) {
  const c = [];

  c.push(para('Golden Thread — Safety Case Summary', { heading: 'Heading1' }));
  if (m.building) c.push(para(m.building, { size: 22, bold: true, after: 40 }));
  c.push(para(`Generated ${fmtDateTime(m.generatedAt)}`, { size: 16, color: COLOURS.textMuted, after: 160 }));

  // Overview
  const s = m.summary;
  c.push(para('Overview', { heading: 'Heading2' }));
  c.push(docTable(
    ['Current documents', 'Safety-critical', 'Reviews due soon', 'Reviews overdue', 'Categories satisfied', 'Occurrences'],
    [1744, 1744, 1744, 1744, 1744, 1746],
    [[
      String(s.current), String(s.safetyCritical), String(s.dueSoon), String(s.overdue),
      `${s.categoriesSatisfied} / ${s.categoriesApplicable}`, String(s.occurrences),
    ]],
  ));

  // Schedule-1 completeness
  c.push(para('Schedule-1 completeness', { heading: 'Heading2' }));
  c.push(docTable(
    ['Cat', 'Category', 'Current', 'Status'],
    [900, 7166, 1000, 1400],
    m.completeness.map((cat) => [
      String(cat.code), cat.name, String(cat.currentCount), cat.satisfied ? 'Satisfied' : 'MISSING',
    ]),
  ));

  // Controlled documents by category
  c.push(para('Controlled documents by category', { heading: 'Heading2' }));
  if (m.byCategory.length === 0) {
    c.push(para('No current documents in the register.', { italics: true, color: COLOURS.textMuted }));
  } else {
    for (const g of m.byCategory) {
      c.push(para(`${g.code} — ${g.name}`, { bold: true, size: 20, before: 160, after: 80 }));
      c.push(docTable(
        ['Reference', 'Title', 'Type', 'Effective', 'Review due', 'Review'],
        [1500, 3266, 2200, 1200, 1200, 1100],
        g.documents.map((d) => [
          d.reference, d.title, d.document_type,
          d.effective_from ? fmtDate(d.effective_from) : '—',
          d.review_due ? fmtDate(d.review_due) : '—',
          bandText(d.review_band),
        ]),
      ));
    }
  }

  // Safety-critical
  c.push(para('Safety-critical documents', { heading: 'Heading2' }));
  if (m.safetyCritical.length === 0) {
    c.push(para('None recorded.', { italics: true, color: COLOURS.textMuted }));
  } else {
    c.push(docTable(
      ['Reference', 'Title', 'Type', 'Review due', 'Review'],
      [1600, 4066, 2400, 1200, 1200],
      m.safetyCritical.map((d) => [
        d.reference, d.title, d.document_type,
        d.review_due ? fmtDate(d.review_due) : '—', bandText(d.review_band),
      ]),
    ));
  }

  // Occurrences (MOR)
  c.push(para('Mandatory occurrence reporting', { heading: 'Heading2' }));
  if (m.occurrences.total === 0) {
    c.push(para('No occurrence reports recorded.', { italics: true, color: COLOURS.textMuted }));
  } else {
    c.push(para(`${m.occurrences.total} occurrence report(s) recorded.`, { after: 80 }));
    c.push(docTable(
      ['Status', 'Count'],
      [8466, 2000],
      m.occurrences.byStatus.map((b) => [b.status, String(b.count)]),
    ));
  }

  return c;
}

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const model = await request.json();
    if (!model || !model.summary) return json({ error: 'No safety-case model provided' }, { status: 400 });

    const generatedAt = fmtDateTime(model.generatedAt);
    const doc = new Document({
      styles: DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers: { default: makeHeader('Golden Thread — Safety Case Summary', generatedAt) },
        footers: { default: makeFooter() },
        children: buildContent(model),
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="golden-thread-safety-case-${stamp}.docx"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (err) {
    logger('safety case docx failed:', err instanceof Error ? err.message : String(err));
    return json({ error: err instanceof Error ? err.message : 'Safety case generation failed' }, { status: 500 });
  }
}
