// src/routes/api/reports/generate-docx/+server.js
// CLEANED: All console.log replaced with logger

import { json } from '@sveltejs/kit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
         AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
         VerticalAlign, PageBreak } from 'docx';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('GenerateDocx');

export async function POST({ request }) {
  logger('DOCX generation request received');

  try {
    logger('Parsing request body');
    const { issues, filterDate, includeCurrent, includeParked, includeCompleted, sortOrder } = await request.json();
    
    logger('✅ Request parsed successfully');
    logger('Issues count:', issues?.length || 0);
    logger('Filter date:', filterDate || 'none');
    logger('Filters:', { includeCurrent, includeParked, includeCompleted });

    if (!issues || issues.length === 0) {
      logger('⚠️ No issues provided - returning 204');
      return new Response('', { status: 204 });
    }

    logger('Creating document structure');
    
    const doc = new Document({
      styles: {
        default: { 
          document: { 
            run: { font: "Arial", size: 24 }
          } 
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 32, bold: true, font: "Arial", color: "000000" },
            paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 }
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 28, bold: true, font: "Arial", color: "000000" },
            paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 }
          },
          {
            id: "Heading3",
            name: "Heading 3",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 24, bold: true, font: "Arial", color: "000000" },
            paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 2 }
          }
        ]
      },
      numbering: {
        config: [
          {
            reference: "issue-numbers",
            levels: [
              {
                level: 0,
                format: "decimal",
                text: "%1.",
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: { indent: { left: 720, hanging: 360 } }
                }
              }
            ]
          },
          {
            reference: "bullets",
            levels: [
              {
                level: 0,
                format: "bullet",
                text: "•",
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: { indent: { left: 720, hanging: 360 } }
                }
              }
            ]
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840
            },
            margin: { 
              top: 720,
              right: 720,
              bottom: 720,
              left: 720
            }
          }
        },
        children: await generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted, sortOrder)
      }]
    });

    logger('✅ Document structure created');
    logger('Generating buffer');

    const buffer = await Packer.toBuffer(doc);
    
    logger('✅ Buffer generated successfully');
    logger('Buffer size:', buffer.length, 'bytes (', (buffer.length / 1024).toFixed(2), 'KB)');

    const filename = `Issues_Report_${new Date().toISOString().split('T')[0]}.docx`;
    logger('Filename:', filename);

    logger('✅ Sending response');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (err) {
    logger('❌ Error generating DOCX:', err.message);
    logger('Stack:', err.stack);
    
    return json({ 
      error: err.message,
      type: err.constructor.name,
      stack: err.stack
    }, { status: 500 });
  }
}

async function generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted, sortOrder = 'desc') {
  logger('Generating report content');
  logger('Issues:', issues.length);

  // Issues arrive pre-filtered and pre-sorted by the client — just split for section headings.
  const currentIssues   = issues.filter(i => (i.status || 'current') === 'current');
  const parkedIssues    = issues.filter(i => i.status === 'parked');
  const completedIssues = issues.filter(i => i.status === 'completed');

  logger('- Current:', currentIssues.length, '- Parked:', parkedIssues.length, '- Completed:', completedIssues.length);
  
  const content = [];
  
  logger('Adding report header');
  content.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun("Issues Report")]
    })
  );
  
  const statuses = [
    includeCurrent && 'Current',
    includeParked && 'Parked',
    includeCompleted && 'Completed'
  ].filter(Boolean).join(', ');
  
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let headerText = `Generated: ${generatedDate} • Showing: ${statuses}`;
  if (filterDate) {
    headerText += ` created since: ${fmtShortDate(filterDate)}`;
  }
  
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: headerText,
          size: 20,
          color: "666666"
        })
      ],
      spacing: { after: 360 }
    })
  );

  logger('Processing issues');
  let issueNumber = 1;
  
  if (currentIssues.length > 0) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Current Issues")],
        spacing: { after: 240 }
      })
    );
    
    for (const issue of currentIssues) {
      logger('Processing issue', issueNumber, ':', issue.name?.substring(0, 50));
      try {
        content.push(...await generateIssueContent(issue, issueNumber, sortOrder));
        issueNumber++;
      } catch (err) {
        logger('❌ Error processing issue', issueNumber, ':', err.message);
        throw err;
      }
    }
  }
  
  if (parkedIssues.length > 0) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Parked Issues")],
        spacing: { before: 480, after: 240 }
      })
    );
    
    for (const issue of parkedIssues) {
      logger('Processing issue', issueNumber, ':', issue.name?.substring(0, 50));
      try {
        content.push(...await generateIssueContent(issue, issueNumber, sortOrder));
        issueNumber++;
      } catch (err) {
        logger('❌ Error processing issue', issueNumber, ':', err.message);
        throw err;
      }
    }
  }
  
  if (completedIssues.length > 0) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Completed Issues")],
        spacing: { before: 480, after: 240 }
      })
    );
    
    for (const issue of completedIssues) {
      logger('Processing issue', issueNumber, ':', issue.name?.substring(0, 50));
      try {
        content.push(...await generateIssueContent(issue, issueNumber, sortOrder));
        issueNumber++;
      } catch (err) {
        logger('❌ Error processing issue', issueNumber, ':', err.message);
        throw err;
      }
    }
  }

  logger('Adding report footer');
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "End of Report",
          italics: true,
          color: "999999"
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 }
    })
  );

  logger('✅ Report content generated:', content.length, 'elements');
  return content;
}

async function generateIssueContent(issue, number, sortOrder = 'desc') {
  const content = [];
  const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  const titleWidth = 9300;
  const priorityWidth = 1500;
  
  const headerCells = [
    new TableCell({
      borders,
      width: { size: titleWidth, type: WidthType.DXA },
      shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: issue.issue_number +'.  ' + issue.name,
              bold: true,
              size: 26
            })
          ]
        })
      ]
    }),
    new TableCell({
      borders,
      width: { size: priorityWidth, type: WidthType.DXA },
      shading: { fill: getPriorityColorHex(issue.priority), type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 80, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: getPriorityLabel(issue.priority),
              bold: true,
              size: 18,
              color: "FFFFFF"
            })
          ],
          alignment: AlignmentType.CENTER
        })
      ]
    })
  ];

  content.push(
    new Table({
      width: { size: titleWidth + priorityWidth, type: WidthType.DXA },
      columnWidths: [titleWidth, priorityWidth],
      rows: [
        new TableRow({
          children: headerCells
        })
      ]
    })
  );

  if (issue.description) {
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: issue.description,
            size: 22
          })
        ],
        spacing: { before: 120, after: 120 }
      })
    );
  }

  const createdBy = issue.created_by_profile?.full_name || 'Unknown';
  let dateInfo = `Created: ${fmtShortDate(issue.created_at)} by ${createdBy}`;

  const createdTime = new Date(issue.created_at).getTime();
  const updatedTime = issue.updated_at ? new Date(issue.updated_at).getTime() : createdTime;

  if (updatedTime > createdTime) {
    const updatedBy = issue.updated_by_profile?.full_name || 'Unknown';
    dateInfo += ` • Modified: ${fmtShortDate(issue.updated_at)} by ${updatedBy}`;
  }
  
  const outstandingCount = (issue.outstandingActions || []).length;
  if (outstandingCount > 0) {
    dateInfo += ` • ${outstandingCount} outstanding ${outstandingCount === 1 ? 'action' : 'actions'}`;
  }
  
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: dateInfo,
          size: 18,
          color: "666666"
        })
      ],
      spacing: { after: 180 }
    })
  );

  // ── Activity Log — all types, single chronological list ─────────────
  const ACTIVITY_TYPE_META = {
    comment:  { label: 'Comment',  color: '1d4ed8' },
    decision: { label: 'Decision', color: '7c3aed' },
    note:     { label: 'Note',     color: 'd97706' },
    email:    { label: 'Email',    color: '0891b2' },
    call:     { label: 'Call',     color: '16a34a' },
    letter:   { label: 'Letter',   color: 'ea580c' },
    document: { label: 'Document', color: 'e11d48' }
  };

  const dir = sortOrder === 'asc' ? 1 : -1;
  const sortedActivities = (issue.activities || [])
    .slice()
    .sort((a, b) => dir * (new Date(a.created_at) - new Date(b.created_at)));

  if (sortedActivities.length > 0) {
    content.push(new Paragraph({
      children: [new TextRun({ text: `Activity Log (${sortedActivities.length}):`, bold: true, size: 24, color: '333333' })],
      spacing: { before: 180, after: 120 }
    }));

    for (const item of sortedActivities) {
      const type = item.activity_type || 'comment';
      const meta = ACTIVITY_TYPE_META[type] ?? { label: type, color: '666666' };
      const f = item.fields || {};

      // Structured-field summary for email / call / letter
      let fieldsLine = '';
      if (type === 'email') {
        const parts = [];
        if (f.from || f.to) parts.push(`${f.from || '?'} → ${f.to || '?'}`);
        if (f.subject)       parts.push(`Re: ${f.subject}`);
        if (f.email_date)    parts.push(fmtFieldDate(f.email_date));
        fieldsLine = parts.join('  ·  ');
      } else if (type === 'call') {
        const parts = [];
        if (f.direction) parts.push(f.direction);
        if (f.caller)    parts.push(f.caller);
        if (f.duration)  parts.push(f.duration);
        fieldsLine = parts.join('  ·  ');
      } else if (type === 'letter') {
        const parts = [];
        if (f.from || f.to) parts.push(`${f.from || '?'} → ${f.to || '?'}`);
        if (f.reference)    parts.push(`Ref: ${f.reference}`);
        if (f.letter_date)  parts.push(fmtFieldDate(f.letter_date));
        fieldsLine = parts.join('  ·  ');
      }

      // Type badge (+ optional fields summary) on first line
      const badgeRuns = [
        new TextRun({ text: `[${meta.label}]`, bold: true, size: 20, color: meta.color })
      ];
      if (fieldsLine) {
        badgeRuns.push(new TextRun({ text: `  ${fieldsLine}`, size: 20, color: '555555', italics: true }));
      }
      content.push(new Paragraph({
        children: badgeRuns,
        spacing: { before: 120, after: 20, left: 360 }
      }));

      // Body text (historic entries visually dimmed)
      if (item.historic) {
        content.push(new Paragraph({
          children: [
            new TextRun({ text: '[Historic]  ', bold: true, size: 20, color: 'd97706' }),
            new TextRun({ text: item.body, size: 22, color: '888888', italics: true })
          ],
          spacing: { before: 0, after: 40, left: 360 }
        }));
      } else {
        content.push(new Paragraph({
          children: [new TextRun({ text: item.body, size: 22 })],
          spacing: { before: 0, after: 40, left: 360 }
        }));
      }

      // Metadata line
      const cTime = new Date(item.created_at).getTime();
      const uTime = item.updated_at ? new Date(item.updated_at).getTime() : cTime;
      let itemMeta = fmtShortDate(item.created_at);
      if (item.created_by_profile?.full_name) itemMeta += `  ·  ${item.created_by_profile.full_name}`;
      if (uTime - cTime > 1000) itemMeta += `  ·  Modified: ${fmtShortDate(item.updated_at)}`;
      content.push(new Paragraph({
        children: [new TextRun({ text: itemMeta, size: 18, color: '999999', italics: true })],
        spacing: { after: 120, left: 360 }
      }));
    }
  }

  if (issue.outstandingActions && issue.outstandingActions.length > 0) {
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Outstanding Actions:",
            bold: true,
            size: 24
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    const sortedActions = [...issue.outstandingActions].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    for (const action of sortedActions) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: action.action_text,
              bold: true,
              size: 22
            })
          ],
          spacing: { before: 60, after: 40, left: 360 }
        })
      );

      const details = [];
      if (action.name_text) {
        details.push(`👤 ${action.name_text}`);
      }
      if (action.date_deadline) {
        const isOverdue = new Date(action.date_deadline) < new Date();
        details.push(`📅 Due: ${fmtShortDate(action.date_deadline)}${isOverdue ? ' ⚠️' : ''}`);
      }
      if (action.status) {
        details.push(`Status: ${action.status}`);
      }

      if (details.length > 0) {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: details.join(' • '),
                size: 20,
                color: "666666"
              })
            ],
            spacing: { after: 40, left: 360 }
          })
        );
      }

      const actionCreatedBy = action.created_by_profile?.full_name || 'Unknown';
      let actionDateInfo = `Added: ${fmtShortDate(action.created_at)} by ${actionCreatedBy}`;

      const actionCreatedTime = new Date(action.created_at).getTime();
      const actionUpdatedTime = action.updated_at ? new Date(action.updated_at).getTime() : actionCreatedTime;

      if (actionUpdatedTime > actionCreatedTime) {
        const actionUpdatedBy = action.updated_by_profile?.full_name || 'Unknown';
        actionDateInfo += ` • Modified: ${fmtShortDate(action.updated_at)} by ${actionUpdatedBy}`;
      }

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: actionDateInfo,
              size: 18,
              color: "999999",
              italics: true
            })
          ],
          spacing: { after: 120, left: 360 }
        })
      );
    }
  }

  content.push(
    new Paragraph({
      children: [new TextRun("")],
      spacing: { after: 360 }
    })
  );

  return content;
}

function fmtShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Field dates are stored as YYYY-MM-DD; add a noon time to avoid timezone shift.
function fmtFieldDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPriorityLabel(priority) {
  const labels = {
    1: "Top Priority",
    2: "Major Project",
    3: "Important",
    4: "Minor",
    5: "Pending"
  };
  return labels[priority] || `Priority ${priority}`;
}

function getPriorityColorHex(priority) {
  const colors = {
    1: "475569",
    2: "475569",
    3: "475569",
    4: "475569",
    5: "475569"
  };
  return colors[priority] || "6B7280";
}
