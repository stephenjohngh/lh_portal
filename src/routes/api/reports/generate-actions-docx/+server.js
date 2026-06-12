// src/routes/api/reports/generate-actions-docx/+server.js
// Generates a Word document from the actions report data.
// Accepts grouped data: { groups: [{ issue, actions }], selectedUser, userName, sortMode }

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType
} from 'docx';
import { getLogger }    from '$lib/utils/logger';
import { fmtShortDate } from '$lib/utils/dates';

const logger = getLogger('GenerateActionsDocx');

// ── Shared helpers ────────────────────────────────────────────────────────────

const BORDER  = { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: String(text ?? ''), ...opts })],
    ...(opts._para ?? {})
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST({ request }) {
  // Authenticated users only — these endpoints render caller-supplied data
  // into official-looking documents and burn server compute; neither should
  // be reachable anonymously.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  logger('Actions DOCX generation request received');
  try {
    const { groups, selectedUser, userName, sortMode } = await request.json();

    if (!groups || !Array.isArray(groups)) {
      return json({ error: 'No groups provided' }, { status: 400 });
    }

    const totalActions = groups.reduce((n, g) => n + (g.actions?.length ?? 0), 0);
    if (totalActions === 0) {
      return new Response('', { status: 204 });
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 24 } } }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: buildContent(groups, userName, sortMode, totalActions)
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const today  = new Date().toISOString().split('T')[0];
    const suffix = selectedUser === 'all'         ? 'All_Users'
                 : selectedUser === 'unallocated' ? 'Unallocated'
                 : (userName ?? '').replace(/\s+/g, '_');
    const filename = `Actions_Report_${suffix}_${today}.docx`;

    logger('✅ Generated', filename, buffer.length, 'bytes');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (err) {
    logger('❌', err.message);
    return json({ error: err.message }, { status: 500 });
  }
}

// ── Document builder ──────────────────────────────────────────────────────────

function buildContent(groups, userName, sortMode, totalActions) {
  const content = [];

  // ── Report header ─────────────────────────────────────────────────────────

  content.push(p('Actions Report', {
    bold: true, size: 36,
    _para: { spacing: { after: 80 } }
  }));

  const sortLabel = sortMode === 'deadline'
    ? 'Earliest deadline first'
    : 'Priority → Issue number → Status → Deadline';

  content.push(p(
    [
      `Generated ${fmtShortDate(new Date().toISOString())}`,
      userName,
      `${totalActions} ${totalActions === 1 ? 'action' : 'actions'} across ${groups.length} ${groups.length === 1 ? 'issue' : 'issues'}`,
      `Sorted: ${sortLabel}`
    ].join('  ·  '),
    { size: 20, color: '888888', _para: { spacing: { after: 60 } } }
  ));

  // Divider
  content.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
    spacing: { after: 360 }
  }));

  // ── Per-issue sections ────────────────────────────────────────────────────

  let actionNumber = 1;

  for (const { issue, actions } of groups) {
    // Issue header row (darker shading to distinguish from action rows)
    const issueLabel = [
      issue.issue_number ? `#${issue.issue_number}` : null,
      issue.name
    ].filter(Boolean).join('  —  ');

    const statusSuffix = issue.status === 'parked'    ? '  [Parked]'
                       : issue.status === 'completed' ? '  [Completed]'
                       : '';

    content.push(
      new Table({
        width: { size: 10800, type: WidthType.DXA },
        columnWidths: [10800],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: BORDERS,
                shading: { fill: 'DDDDDD', type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 180, right: 180 },
                width: { size: 10800, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: issueLabel, bold: true, size: 26 }),
                      ...(statusSuffix
                        ? [new TextRun({ text: statusSuffix, size: 22, color: '666666' })]
                        : []),
                      new TextRun({
                        text: `  (${actions.length} ${actions.length === 1 ? 'action' : 'actions'})`,
                        size: 20, color: '888888'
                      })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      })
    );

    // Actions within this issue
    for (const action of actions) {
      content.push(...buildActionContent(action, actionNumber++));
    }

    content.push(new Paragraph({ children: [], spacing: { after: 240 } }));
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  content.push(p('End of Report', {
    italics: true, color: '999999',
    _para: {
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } }
    }
  }));

  return content;
}

// ── Single action ─────────────────────────────────────────────────────────────

function buildActionContent(action, number) {
  const content = [];

  // Action text (lightly shaded table row, indented under the issue header)
  content.push(
    new Table({
      width: { size: 10440, type: WidthType.DXA },
      columnWidths: [10440],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: BORDERS,
              shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 180, right: 180 },
              width: { size: 10440, type: WidthType.DXA },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${number}.`, bold: true, size: 22, color: '888888' }),
                    new TextRun({ text: `  ${action.action_text}`, bold: true, size: 22 })
                  ]
                })
              ]
            })
          ]
        })
      ],
      margins: { left: 360 }
    })
  );

  // Detail line: status · assignee · deadline · added
  const isOverdue = action.date_deadline && new Date(action.date_deadline) < new Date();
  const details = [
    action.status,
    action.name_text                ? `👤 ${action.name_text}` : null,
    action.date_deadline            ? `📅 Due: ${fmtShortDate(action.date_deadline)}${isOverdue ? ' ⚠️' : ''}` : null,
    `Added: ${fmtShortDate(action.created_at)}`
  ].filter(Boolean).join('  ·  ');

  content.push(p(details, {
    size: 20, color: '666666',
    _para: {
      spacing: { before: 60, after: 300 },
      indent: { left: 540 }
    }
  }));

  return content;
}
