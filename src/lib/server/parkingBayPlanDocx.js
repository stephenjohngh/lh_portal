// src/lib/server/parkingBayPlanDocx.js
// The caretaker's printable bay plan (user, 2026-09-26: "a word doc with the 2
// floors on one page showing who has each space and which empty").
//
// Page 1: every basement level's plan on ONE page, each bay coloured by state
// and labelled with its number and who has it. The images are drawn in the
// browser (parking/utils/bayPlanImage.js), as the component report does,
// because only the browser can load the plan and draw on it.
// Page 2: the same as a list, for a name too small to read on the plan.
//
// Lives in $lib/server so it can be tested: a +server.js may only export HTTP
// verbs, and document generation fails at runtime on things static analysis
// cannot see.
//
// ⚠ It names people. The header says so on every page.

import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, VerticalAlign, TableLayoutType, PageBreak, BorderStyle,
} from 'docx';
import {
  CONTENT_W, CONTENT_W_L, hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
} from './docxHelpers.js';

const PX_PER_DXA = 96 / 1440;      // an image is sized in px at 96 dpi; the page in DXA
const PERSONAL = 'Contains personal data — keep with the caretaker, and destroy old copies.';

/**
 * How to lay the plans out on one page. Wide plans stack on a portrait page;
 * tall or square ones sit side by side on a landscape page. Either way every
 * plan is scaled to fit its share, never enlarged past its own size.
 * @param {{width:number, height:number}[]} levels
 */
export function planLayout(levels) {
  const n = Math.max(1, levels.length);
  const meanAspect = levels.reduce((t, l) => t + (l.width / l.height), 0) / n;
  const stacked = meanAspect > 1.2;
  const pageW = Math.round((stacked ? CONTENT_W : CONTENT_W_L) * PX_PER_DXA);
  // Height left for the plans after the header, title, legend and captions.
  const pageH = stacked ? 900 : 560;
  const boxW = stacked ? pageW : Math.floor(pageW / n) - 12;
  const boxH = stacked ? Math.floor(pageH / n) - 30 : pageH;
  const sized = levels.map(l => {
    const s = Math.min(1, boxW / l.width, boxH / l.height);
    return { ...l, dW: Math.round(l.width * s), dH: Math.round(l.height * s) };
  });
  return { stacked, landscape: !stacked, sized };
}

function planImage(level) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new ImageRun({
      data: Buffer.from(level.imageBase64, 'base64'),
      type: 'png',
      transformation: { width: level.dW, height: level.dH },
    })],
  });
}

function caption(level) {
  return para(level.name, { bold: true, size: 20, after: 40, align: AlignmentType.CENTER });
}

/**
 * @param {{
 *   building?: string, generatedAt?: string,
 *   levels: {name:string, imageBase64:string, width:number, height:number}[],
 *   rows: string[][],     // Bay, Size, State, Holder, Vehicles
 *   legend: {label:string, colour:string}[],
 * }} body
 */
export function buildBayPlanDocument(body) {
  const { building = 'Lancaster House', generatedAt = '', levels = [], rows = [], legend = [] } = body ?? {};
  const drawn = levels.filter(l => l.imageBase64 && l.width && l.height);
  if (drawn.length === 0) throw new Error('No basement plan could be drawn');

  const { stacked, landscape, sized } = planLayout(drawn);
  const contentW = landscape ? CONTENT_W_L : CONTENT_W;
  const title = `Car park — who has each bay`;

  const legendLine = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: legend.flatMap((l, i) => [
      run('■ ', { color: l.colour.replace('#', ''), size: 22 }),
      run(`${l.label}${i < legend.length - 1 ? '     ' : ''}`, { size: 16 }),
    ]),
  });

  // The plans: stacked, one after another; or side by side in a table whose
  // column widths are declared on the table itself (tableGridGuard.test.js —
  // Word ignores per-cell widths).
  let plans;
  if (stacked) {
    plans = sized.flatMap(l => [caption(l), planImage(l)]);
  } else {
    const colW = Math.floor(contentW / sized.length);
    plans = [new Table({
      width: { size: contentW, type: WidthType.DXA },
      columnWidths: sized.map(() => colW),
      layout: TableLayoutType.FIXED,
      borders: Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical']
        .map(side => [side, { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }])),
      rows: [new TableRow({
        children: sized.map(l => new TableCell({
          width: { size: colW, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          children: [caption(l), planImage(l)],
        })),
      })],
    })];
  }

  // Page 2: the list.
  const headers = ['Bay', 'Size', 'State', 'Who has it', 'Vehicles'];
  const cols = [0.12, 0.12, 0.16, 0.36, 0.24].map(f => Math.floor(contentW * f));
  const list = new Table({
    width: { size: contentW, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => hCell(h, cols[i])) }),
      ...rows.map((r, n) => new TableRow({
        children: r.map((v, i) => dCell(String(v ?? ''), cols[i], { alt: n % 2 === 1 })),
      })),
    ],
  });

  return new Document({
    styles: DOC_STYLES,
    sections: [{
      properties: pageProps({ landscape }),
      headers: { default: makeHeader(`${building} · ${title} · ${PERSONAL}`, generatedAt, contentW) },
      footers: { default: makeFooter() },
      children: [
        para(title, { bold: true, size: 28, after: 60 }),
        legendLine,
        ...plans,
        new Paragraph({ children: [new PageBreak()] }),
        para('Every bay', { bold: true, size: 24, after: 120 }),
        list,
      ],
    }],
  });
}

export async function buildBayPlanBuffer(body) {
  return Packer.toBuffer(buildBayPlanDocument(body));
}
