// src/lib/server/docxHelpers.js
// Shared Word document primitives for all report server endpoints.
// Server-only — in $lib/server/ so it cannot be accidentally imported client-side.

import {
  Paragraph, TextRun, TableCell,
  Header, Footer, PageNumber, AlignmentType,
  WidthType, BorderStyle, ShadingType, VerticalAlign
} from 'docx';

// -- A4 portrait page geometry ------------------------------------------------
export const PAGE_W    = 11906;
export const PAGE_H    = 16838;
export const MARGIN    = 720;                       // 0.5 inch all sides
export const CONTENT_W = PAGE_W - 2 * MARGIN;      // 10466 DXA

// -- Shared colour tokens -----------------------------------------------------
export const COLOURS = {
  headerFill:  '2C3E6B',   // dark navy — table header rows
  altRowFill:  'F2F5FA',   // very light blue — alternating data rows
  border:      'C8D0DC',   // light grey — table and header borders
  textDark:    '1A1A2E',   // near-black — body text
  textWhite:   'FFFFFF',   // white — header row text
  textMuted:   '9CA3AF',   // grey — metadata / timestamps
  failRed:     'C0392B',   // red — failed status cells
  passGreen:   '16A34A',   // green — pass results
  warnAmber:   'D97706',   // amber — open status, warnings
  subheading:  '2C3E6B',   // same as headerFill — Heading 2 colour
};

// -- Shared cell / border constants -------------------------------------------
export const CELL_PAD = { top: 80, bottom: 80, left: 120, right: 120 };

const BORDER_1 = { style: BorderStyle.SINGLE, size: 1, color: COLOURS.border };
export const BORDERS = {
  top:              BORDER_1,
  bottom:           BORDER_1,
  left:             BORDER_1,
  right:            BORDER_1,
  insideHorizontal: BORDER_1,
  insideVertical:   BORDER_1,
};

// -- Text run helper -----------------------------------------------------------
// opts: { size, bold, italics, color }
export function run(text, opts = {}) {
  return new TextRun({
    text:    String(text ?? ''),
    font:    'Arial',
    size:    opts.size    ?? 18,
    bold:    opts.bold    ?? false,
    italics: opts.italics ?? false,
    color:   opts.color,
  });
}

// -- Paragraph helper ----------------------------------------------------------
// children: string (auto-wrapped in run()) or TextRun[]
// opts: { size, bold, italics, color, align, before, after, border, heading }
export function para(children, opts = {}) {
  const runs = typeof children === 'string' ? [run(children, opts)] : children;
  return new Paragraph({
    alignment: opts.align,
    spacing:   { before: opts.before ?? 0, after: opts.after ?? 120 },
    border:    opts.border,
    children:  runs,
    ...(opts.heading ? { heading: opts.heading } : {}),
  });
}

// -- Table cell helpers --------------------------------------------------------

/**
 * Header cell — dark navy fill, white bold text.
 * opts: { fill, size, color }
 */
export function hCell(text, widthDxa, opts = {}) {
  return new TableCell({
    width:         { size: widthDxa, type: WidthType.DXA },
    margins:       CELL_PAD,
    borders:       BORDERS,
    shading:       { fill: opts.fill ?? COLOURS.headerFill, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      spacing:  { before: 0, after: 0 },
      children: [run(text, { bold: true, size: opts.size ?? 16, color: opts.color ?? COLOURS.textWhite })],
    })],
  });
}

/**
 * Data cell — white or alternating fill, dark body text.
 * opts: { alt, fill, size, bold, color, align }
 * Newlines (\n) in text are rendered as line breaks within the cell.
 */
export function dCell(text, widthDxa, opts = {}) {
  const fill    = opts.fill ?? (opts.alt ? COLOURS.altRowFill : 'FFFFFF');
  const runOpts = { size: opts.size ?? 18, bold: opts.bold ?? false, color: opts.color };

  // Split on newlines; insert a break TextRun between each line so Word
  // renders them on separate lines rather than collapsing \n to a space.
  const lines    = String(text ?? '—').split('\n');
  const textRuns = lines.flatMap((line, i) => {
    const r = run(line || ' ', runOpts);
    return i === 0 ? [r] : [new TextRun({ break: 1, font: 'Arial' }), r];
  });

  return new TableCell({
    width:         { size: widthDxa, type: WidthType.DXA },
    margins:       CELL_PAD,
    borders:       BORDERS,
    shading:       { fill, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      spacing:   { before: 0, after: 0 },
      children:  textRuns,
    })],
  });
}

// -- Running page header -------------------------------------------------------
// Renders: "Title  [tab]  generatedAt" with a bottom border line.
export function makeHeader(title, generatedAt) {
  return new Header({
    children: [new Paragraph({
      spacing:  { before: 0, after: 0 },
      border:   { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOURS.border, space: 4 } },
      tabStops: [{ type: 'right', position: CONTENT_W }],
      children: [
        run(title,       { size: 16, color: '555555' }),
        new TextRun({ text: '\t', font: 'Arial' }),
        run(generatedAt, { size: 16, color: COLOURS.textMuted }),
      ],
    })],
  });
}

// -- Page-numbered footer ------------------------------------------------------
export function makeFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 0 },
      children:  [
        run('Page ',  { size: 16, color: COLOURS.textMuted }),
        new TextRun({ children: [PageNumber.CURRENT],     font: 'Arial', size: 16, color: COLOURS.textMuted }),
        run(' of ',   { size: 16, color: COLOURS.textMuted }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 16, color: COLOURS.textMuted }),
      ],
    })],
  });
}

// -- Standard document styles --------------------------------------------------
export const DOC_STYLES = {
  default: { document: { run: { font: 'Arial', size: 18 } } },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run:       { size: 36, bold: true, font: 'Arial', color: COLOURS.textDark },
      paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run:       { size: 26, bold: true, font: 'Arial', color: COLOURS.subheading },
      paragraph: { spacing: { before: 400, after: 120 }, outlineLevel: 1 },
    },
  ],
};

// -- Page section properties helper -------------------------------------------
// Returns the properties object used in document sections[].properties
export function pageProps(opts = {}) {
  const m = opts.margin ?? MARGIN;
  return {
    page: {
      size:   { width: opts.width ?? PAGE_W, height: opts.height ?? PAGE_H },
      margin: { top: m, right: m, bottom: m, left: m },
    },
  };
}

