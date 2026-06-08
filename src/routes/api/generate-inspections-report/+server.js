// src/routes/api/generate-inspections-report/+server.js
//
// Generate Word document inspection reports for component inspections.
//
// Summary:  Cover + one table row per session.
// Detailed: Cover + one section per session (metadata + inspection table + photos).
//
// Result values lowercase: 'ok' | 'failed' | 'problem' | 'inactive'
// photo_urls is an array (multiple photos per inspection)
//   - session.floor_short_name pre-resolved client-side (floor_id is the raw FK)
//   - session.inspector_name pre-resolved from profiles join
//   - session.session_preset_label pre-resolved from presetLabel()
//   - component ref format: floor_name/type_initial/asset_id
//
// Request body:
//   { sessions: [{ session, inspections }], reportType: 'summary' | 'detailed' }

import { json }             from '@sveltejs/kit';
import { storageProvider }  from '$lib/server/storage/index.js';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  PageBreak, ImageRun,
  WidthType, HeadingLevel, ShadingType,
  AlignmentType, VerticalAlign, convertInchesToTwip, TableLayoutType,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, CONTENT_W_L, PAGE_W_L, PAGE_H_L,
  COLOURS, BORDERS, CELL_PAD,
} from '$lib/server/docxHelpers.js';
import { fmtGenerated, fmtDate, fmtDateTime, fmtTime, fmtDuration } from '$lib/utils/dates';

const logger = getLogger('generateInspectionsReport');

// -- Result helpers -------------------------------------------------------------
function resultColor(result) {
  return result === 'ok'       ? COLOURS.passGreen
       : result === 'failed'   ? COLOURS.failRed
       : result === 'problem'  ? 'EA580C'
       : '6B7280';
}

function resultLabel(result) {
  return { ok: 'PASS', failed: 'FAIL', problem: 'PROBLEM', inactive: 'INACTIVE' }[result]
      ?? (result ?? '—').toUpperCase();
}

// -- Session stats (inline — avoids SSR import issues with walk helpers) -------
function sessionStats(inspections) {
  return {
    ok:         inspections.filter(r => r.result === 'ok').length,
    failed:     inspections.filter(r => r.result === 'failed').length,
    problem:    inspections.filter(r => r.result === 'problem').length,
    inactive:   inspections.filter(r => r.result === 'inactive').length,
    components: new Set(inspections.map(r => r.component_id)).size,
    total:      inspections.length,
  };
}

// -- Component ref string -------------------------------------------------------
function componentRef(ins) {
  const floor = ins.floor_name   ?? '?';
  const init  = ins.type_initial ?? '?';
  const id    = ins.asset_id     ?? '?';
  return `${floor}/${init}/${id}`;
}

// -- Image fetch ----------------------------------------------------------------
// Handles two URL forms:
//   /api/media/file/{fileId}  — our own proxy URL; extract the ID and call
//                               storageProvider directly (avoids an extra HTTP
//                               round-trip and works server-side without an origin).
//   https://…                 — any absolute URL (legacy Drive links, Supabase, etc.)
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    // Proxy URL: call storage provider directly with the extracted file ID.
    const proxyMatch = url.match(/^\/api\/media\/file\/([A-Za-z0-9_-]+)$/);
    if (proxyMatch) {
      const { data } = await storageProvider.getFileStream(proxyMatch[1]);
      return data;
    }
    // Absolute URL fallback (e.g. legacy Drive viewer links).
    if (!url.startsWith('http')) {
      logger('⚠️ Unresolvable image URL (not proxy, not absolute):', url);
      return null;
    }
    const response = await fetch(url);
    if (!response.ok) { logger('⚠️ Image fetch failed:', response.status, url); return null; }
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    logger('❌ Image fetch error:', err.message, url); return null;
  }
}

// -- Image dimension helpers ----------------------------------------------------

// Read natural dimensions from a JPEG or PNG buffer without any extra library.
function getImageDimensions(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG: width at byte 16, height at byte 20 (IHDR chunk)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) markers
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) break;
      const marker = buf[i + 1];
      const len    = buf.readUInt16BE(i + 2);
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

// Scale to fit within maxW × maxH preserving aspect ratio.
// Falls back to (maxW × maxH) when natural dims are unknown.
function fitDimensions(natW, natH, maxW, maxH) {
  if (!natW || !natH || natW <= 0 || natH <= 0) return { width: maxW, height: maxH };
  const ratio = natW / natH;
  let w = natW, h = natH;
  if (w > maxW) { w = maxW;     h = Math.round(w / ratio); }
  if (h > maxH) { h = maxH;     w = Math.round(h * ratio); }
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

// -- Cover page -----------------------------------------------------------------
function buildCover(sessions, reportType, generatedAt) {
  const buildings = [...new Set(sessions.map(s => s.building))].sort();
  const title     = reportType === 'summary' ? 'Inspection Summary Report' : 'Inspection Detailed Report';
  return [
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: title, font: 'Arial', size: 48, bold: true, color: COLOURS.textDark })] }),
    new Paragraph({ spacing: { after: 80 },  children: [new TextRun({ text: buildings.join(', '), font: 'Arial', size: 24, color: '475569' })] }),
    new Paragraph({ spacing: { after: 80 },  children: [new TextRun({ text: `Generated: ${generatedAt}`, font: 'Arial', size: 20, color: COLOURS.textMuted })] }),
    new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`, font: 'Arial', size: 20, color: COLOURS.textMuted })] }),
  ];
}

// -- Summary table --------------------------------------------------------------
// Portrait column widths (fallback — summary now uses landscape by default)
// Columns: Date | Building | Floor | Preset | Name | Inspector | Duration | Comps | OK | Fail | Prob | N/A | Photos | Notes
// DXA:      900 |   1100   |  700  |  1000  | 1000 |   1000   |   700    |  650  |550 | 550  |  650 | 650 |   400  |  616
// Sum = 10466
const SUM_COLS = [900, 1100, 700, 1000, 1000, 1000, 700, 650, 550, 550, 650, 650, 400, 616];

// Landscape column widths — proportionally wider, total = CONTENT_W_L = 15398
// Date | Building | Floor | Preset | Name | Inspector | Duration | Comps | OK | Fail | Prob | N/A | Photos | Notes
// 1200 |   1600   |  950  |  1500  | 1300 |   1500   |   950    |  850  |800 | 800  |  850 | 800 |   700  | 1598
const SUM_COLS_L = [1200, 1600, 950, 1500, 1300, 1500, 950, 850, 800, 800, 850, 800, 700, 1598];

// cols defaults to portrait; pass SUM_COLS_L for the landscape summary.
function buildSummaryTable(sessionData, cols = SUM_COLS) {
  const totalW   = cols.reduce((a, b) => a + b, 0);
  const headers  = ['Date', 'Building', 'Floor', 'Preset', 'Name', 'Inspector',
                    'Duration', 'Comps', 'OK', 'Fail', 'Prob', 'N/A', 'Photos', 'Notes'];

  const headerRow = new TableRow({
    tableHeader: true,
    children:    headers.map((h, i) => hCell(h, cols[i])),
  });

  const dataRows = sessionData.map(({ session: s, inspections }, idx) => {
    const st         = sessionStats(inspections);
    const alt        = idx % 2 === 1;
    const dur        = fmtDuration(s.started_at, s.closed_at);
    const flr        = s.floor_short_name ? `Floor ${s.floor_short_name}` : 'All';
    const photoCount = inspections.reduce(
      (n, ins) => n + (Array.isArray(ins.photo_urls) ? ins.photo_urls.length : 0), 0
    );
    return new TableRow({
      children: [
        dCell(fmtDate(s.started_at),        cols[0],  { alt }),
        dCell(s.building,                   cols[1],  { alt }),
        dCell(flr,                          cols[2],  { alt }),
        dCell(s.session_preset_label ?? s.session_preset ?? '—', cols[3], { alt }),
        dCell(s.session_name || '—',        cols[4],  { alt }),
        dCell(s.inspector_name || '—',      cols[5],  { alt }),
        dCell(dur,                          cols[6],  { alt }),
        dCell(String(st.components),        cols[7],  { alt, bold: true }),
        dCell(st.ok       || '—', cols[8],  { alt, color: st.ok       ? COLOURS.passGreen : '9CA3AF' }),
        dCell(st.failed   || '—', cols[9],  { alt, color: st.failed   ? COLOURS.failRed   : '9CA3AF' }),
        dCell(st.problem  || '—', cols[10], { alt, color: st.problem  ? 'EA580C'           : '9CA3AF' }),
        dCell(st.inactive || '—', cols[11], { alt, color: st.inactive ? '6B7280'           : '9CA3AF' }),
        dCell(photoCount  || '—', cols[12], { alt, color: photoCount  ? '0369A1'            : '9CA3AF' }),
        dCell(s.notes || '—',     cols[13], { alt }),
      ],
    });
  });

  return new Table({
    width:        { size: totalW, type: WidthType.DXA },
    columnWidths: cols,
    rows:         [headerRow, ...dataRows],
  });
}

// -- Detailed section — one per session -----------------------------------------
// Inspection table columns: Component | Label | Result | Time | Notes
// DXA:                         1600  |  1700  |   900  | 1200 |  5066
// Sum = 10466
const DET_COLS    = [1600, 1700, 900, 1200, 5066];
const DET_N_COLS  = DET_COLS.length;
const PHOTO_HALF_W = Math.floor(CONTENT_W / 2);   // 5233 DXA — half of content width

// Max pixel dimensions for images in the Word doc (at 96 DPI via docx library).
// Cell margins consume 2 × convertInchesToTwip(0.1) = 288 DXA per cell.
//
// Paired (side-by-side): cell content = PHOTO_HALF_W − 288 = 4945 DXA ≈ 329 px
//   → PHOTO_PAIR_PX = 280  (85 % of cell — safe with margin)
//
// Solo (single photo in full-width cell): cell content = CONTENT_W − 288 = 10178 DXA ≈ 678 px
//   → PHOTO_SOLO_PX = 460  (68 % of cell — safe with generous margin)
//
// KEY: solo photos MUST use the full-width layout (1-column inner table).
// Using the half-width cell for a solo photo with a larger maxPx overflows the
// cell (e.g. 380px > 329px max) and causes ~13 % right-side clipping in Word.
const PHOTO_PAIR_PX = 280;
const PHOTO_SOLO_PX = 460;

// Detect image type from buffer magic bytes so docx v9 gets the correct file
// extension in the ZIP (otherwise images land as ".undefined" which some Word
// builds render at native dimensions, ignoring the explicit EMU sizing).
function getImageType(buf) {
  if (!buf || buf.length < 4) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';   // PNG magic: 89 50 4E 47
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpg';   // JPEG magic: FF D8
  return 'jpg';   // default — Drive serves JPEGs for phone photos
}

// Build photo TableRows for one inspection.
//
// Layout:
//   Paired (i and i+1 both have photos) → 2-column inner table, PHOTO_PAIR_PX max each.
//   Solo   (last photo in an odd sequence) → 1-column full-width inner table, PHOTO_SOLO_PX max.
//
// Each photo has a caption ("Photo N of M") below it.
// Returns an array of TableRow objects (may be empty).
async function buildPhotoRows(photoUrls, alt) {
  if (!photoUrls.length) return [];

  const fill    = alt ? 'F8FAFC' : 'FFFFFF';
  const shading = { fill, type: ShadingType.CLEAR };
  const margins = {
    top: convertInchesToTwip(0.08), bottom: convertInchesToTwip(0.08),
    left: convertInchesToTwip(0.1),  right:  convertInchesToTwip(0.1),
  };

  // Fetch all images in parallel; failures return null (graceful degradation)
  const buffers = await Promise.all(
    photoUrls.map(url => fetchImageBuffer(url).catch(() => null))
  );

  const rows = [];

  for (let i = 0; i < photoUrls.length; i += 2) {
    const isPair = i + 1 < photoUrls.length;
    const maxPx  = isPair ? PHOTO_PAIR_PX : PHOTO_SOLO_PX;

    // Build children array (image para + caption para) for one photo slot
    function photoChildren(buf, photoNum) {
      const dims   = buf ? getImageDimensions(buf) : null;
      const { width, height } = fitDimensions(dims?.width, dims?.height, maxPx, maxPx);
      const imgChild = buf
        ? new ImageRun({ data: buf, type: getImageType(buf), transformation: { width, height } })
        : new TextRun({ text: '[Photo unavailable]', italics: true, color: '9CA3AF', font: 'Arial', size: 18 });
      return [
        new Paragraph({ spacing: { before: 0, after: 40 },  children: [imgChild] }),
        new Paragraph({ spacing: { before: 0, after: 0 },   children: [
          new TextRun({
            text: `Photo ${photoNum} of ${photoUrls.length}`,
            italics: true, color: '9CA3AF', font: 'Arial', size: 16,
          }),
        ]}),
      ];
    }

    let innerTable;

    if (isPair) {
      // Two photos side by side in a 2-column inner table.
      // Each cell is PHOTO_HALF_W wide; content after margins ≈ 329 px — fits PHOTO_PAIR_PX = 280.
      innerTable = new Table({
        width:        { size: CONTENT_W,  type: WidthType.DXA },
        layout:       TableLayoutType.FIXED,
        columnWidths: [PHOTO_HALF_W, CONTENT_W - PHOTO_HALF_W],
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: PHOTO_HALF_W,             type: WidthType.DXA }, margins, shading, children: photoChildren(buffers[i],     i + 1) }),
          new TableCell({ width: { size: CONTENT_W - PHOTO_HALF_W, type: WidthType.DXA }, margins, shading, children: photoChildren(buffers[i + 1], i + 2) }),
        ]})],
      });
    } else {
      // Solo photo: use the full inner table width so the image is not crammed into
      // a half-width cell.  Cell content after margins ≈ 678 px — fits PHOTO_SOLO_PX = 460.
      innerTable = new Table({
        width:        { size: CONTENT_W, type: WidthType.DXA },
        layout:       TableLayoutType.FIXED,
        columnWidths: [CONTENT_W],
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: CONTENT_W, type: WidthType.DXA }, margins, shading, children: photoChildren(buffers[i], i + 1) }),
        ]})],
      });
    }

    rows.push(new TableRow({
      children: [new TableCell({
        width:      { size: CONTENT_W, type: WidthType.DXA },
        columnSpan: DET_N_COLS,
        margins:    { top: 0, bottom: 0, left: 0, right: 0 },
        shading,
        children:   [innerTable],
      })],
    }));
  }

  return rows;
}

async function buildDetailedSession({ session: s, inspections }, isFirst, includePhotos) {
  const children = [];

  if (!isFirst) children.push(new Paragraph({ children: [new PageBreak()] }));

  const st  = sessionStats(inspections);
  const flr = s.floor_short_name ? `Floor ${s.floor_short_name}` : 'All Floors';

  // Session heading
  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 160 },
    children: [new TextRun({
      text: `${s.building} — ${flr} — ${s.session_preset_label ?? s.session_preset ?? '—'}`,
      font: 'Arial', size: 32, bold: true,
    })],
  }));

  // Metadata 2-column table
  const META_L = 1800;
  const META_R = CONTENT_W - META_L;

  function mkMetaRow(label, value, valueColor) {
    return new TableRow({
      children: [
        dCell(label,                META_L, { fill: 'F8FAFC', bold: true, color: '475569' }),
        dCell(String(value ?? '—'), META_R, { fill: 'FFFFFF', color: valueColor }),
      ],
    });
  }

  const metaRows = [
    mkMetaRow('Session Name', s.session_name || '—'),
    mkMetaRow('Session Type', (s.session_type ?? '—').charAt(0).toUpperCase() + (s.session_type ?? '').slice(1)),
    mkMetaRow('Date / Time',  fmtDateTime(s.started_at)),
    mkMetaRow('Inspector',    s.inspector_name || '—'),
    mkMetaRow('Duration',     fmtDuration(s.started_at, s.closed_at)),
    mkMetaRow('Status',       s.status === 'open' ? 'Open' : 'Closed',
                              s.status === 'open' ? COLOURS.warnAmber : '6B7280'),
    mkMetaRow('Components',   `${st.components} inspected (${st.total} records)`),
    mkMetaRow('Results',      `Pass: ${st.ok}   Fail: ${st.failed}   Problem: ${st.problem}   Inactive: ${st.inactive}`),
  ];
  if (s.notes) metaRows.push(mkMetaRow('Closing Notes', s.notes));

  children.push(new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [META_L, META_R],
    rows:         metaRows,
  }));

  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Inspection table
  if (!inspections.length) {
    children.push(new Paragraph({
      spacing:  { after: 120 },
      children: [new TextRun({ text: 'No inspections recorded in this session.', italics: true, color: '9CA3AF', font: 'Arial', size: 18 })],
    }));
    return children;
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('Component', DET_COLS[0]),
      hCell('Label',     DET_COLS[1]),
      hCell('Result',    DET_COLS[2]),
      hCell('Time',      DET_COLS[3]),
      hCell('Notes',     DET_COLS[4]),
    ],
  });

  const dataRows = [];

  for (let idx = 0; idx < inspections.length; idx++) {
    const ins = inspections[idx];
    const alt = idx % 2 === 1;
    const res = ins.result ?? ins.inspection_result ?? '';

    dataRows.push(new TableRow({
      children: [
        dCell(componentRef(ins),        DET_COLS[0], { alt, bold: true }),
        dCell(ins.label || '—',         DET_COLS[1], { alt }),
        dCell(resultLabel(res),         DET_COLS[2], { alt, bold: true, color: resultColor(res) }),
        dCell(fmtTime(ins.inspected_at),DET_COLS[3], { alt }),
        dCell(ins.inspector_notes,      DET_COLS[4], { alt }),
      ],
    }));

    // Condition checklist — one row spanning all 5 columns listing each
    // condition attribute and its pass/fail outcome for this inspection.
    // condition_results comes from the client (enrichInspections) so we
    // don't need the type/attr lookup tables here.
    const condResults = Array.isArray(ins.condition_results) ? ins.condition_results : [];
    if (condResults.length > 0) {
      const condRuns = [];
      condResults.forEach((c, j) => {
        if (j > 0) condRuns.push(new TextRun({ text: '   ', font: 'Arial', size: 18 }));
        const glyph = c.passed === true ? '✓ ' : c.passed === false ? '✗ ' : '— ';
        const colour = c.passed === true ? '15803D' : c.passed === false ? 'B91C1C' : '6B7280';
        condRuns.push(new TextRun({
          text:  `${glyph}${c.name}`,
          bold:  c.passed === false,
          color: colour,
          font:  'Arial',
          size:  18,
        }));
      });
      dataRows.push(new TableRow({
        children: [new TableCell({
          width:      { size: CONTENT_W, type: WidthType.DXA },
          columnSpan: DET_N_COLS,
          margins:    { top: convertInchesToTwip(0.05), bottom: convertInchesToTwip(0.05), left: convertInchesToTwip(0.1), right: convertInchesToTwip(0.1) },
          shading:    { fill: alt ? 'F8FAFC' : 'FFFFFF', type: ShadingType.CLEAR },
          children:   [new Paragraph({
            spacing:  { before: 0, after: 0 },
            children: [
              new TextRun({ text: 'Condition: ', bold: true, color: '475569', font: 'Arial', size: 18 }),
              ...condRuns,
            ],
          })],
        })],
      }));
    }

    // Photos — side-by-side pairs, aspect-ratio aware, with captions.
    // Omitted entirely when includePhotos is false.
    if (includePhotos) {
      const photoUrls = Array.isArray(ins.photo_urls) ? ins.photo_urls : [];
      if (photoUrls.length > 0) {
        const photoRows = await buildPhotoRows(photoUrls, alt);
        dataRows.push(...photoRows);
      } else {
        // Note the absence of photos for compliance traceability.
        dataRows.push(new TableRow({
          children: [new TableCell({
            width:      { size: CONTENT_W, type: WidthType.DXA },
            columnSpan: DET_N_COLS,
            margins:    { top: convertInchesToTwip(0.04), bottom: convertInchesToTwip(0.04), left: convertInchesToTwip(0.1), right: convertInchesToTwip(0.1) },
            shading:    { fill: alt ? 'F8FAFC' : 'FFFFFF', type: ShadingType.CLEAR },
            children:   [new Paragraph({ spacing: { before: 0, after: 0 }, children: [
              new TextRun({ text: 'No photos recorded.', italics: true, color: 'C0C8D0', font: 'Arial', size: 16 }),
            ]})],
          })],
        }));
      }
    }
  }

  children.push(new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: DET_COLS,
    rows:         [headerRow, ...dataRows],
  }));

  return children;
}

// -- POST handler ---------------------------------------------------------------
export async function POST({ request }) {
  logger('📄 POST /api/generate-inspections-report');

  try {
    const { sessions, reportType, includePhotos = true } = await request.json();

    if (!sessions?.length) return json({ error: 'No sessions supplied' }, { status: 400 });

    const generatedAt  = fmtGenerated();
    const buildings    = [...new Set(sessions.map(d => d.session.building))].sort().join(', ');
    const titleLabel   = reportType === 'summary' ? 'Inspection Summary' : 'Inspection Report';
    // Summary uses landscape so the 14-column table has room to breathe.
    // Detailed stays portrait (multi-page narrative + photos).
    const isLandscape  = reportType === 'summary';
    const contentW     = isLandscape ? CONTENT_W_L : CONTENT_W;

    const children = [...buildCover(sessions.map(d => d.session), reportType, generatedAt)];

    if (reportType === 'summary') {
      children.push(buildSummaryTable(sessions, SUM_COLS_L));
    } else {
      for (let i = 0; i < sessions.length; i++) {
        const sessionChildren = await buildDetailedSession(sessions[i], i === 0, includePhotos);
        children.push(...sessionChildren);
      }
    }

    const doc = new Document({
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps(isLandscape ? { width: PAGE_W_L, height: PAGE_H_L } : {}),
        headers:    { default: makeHeader(`${buildings} — ${titleLabel}`, generatedAt, contentW) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Generated', reportType, 'report | sessions:', sessions.length, '| size:', buffer.byteLength);

    const slug     = reportType === 'summary' ? 'Summary' : 'Detailed';
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Inspections_${slug}_${dateSlug}.docx`;

    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (err) {
    logger('❌ Error:', err.message, err.stack);
    return json({ error: err.message }, { status: 500 });
  }
}
