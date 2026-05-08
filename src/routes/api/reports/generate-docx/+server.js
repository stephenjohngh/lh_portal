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
    const { issues, filterDate, includeCurrent, includeParked, includeCompleted } = await request.json();
    
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
        children: await generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted)
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

async function generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted) {
  logger('Generating report content');
  logger('Total issues provided:', issues.length);
  logger('Filters:', { includeCurrent, includeParked, includeCompleted });
  
  let filteredIssues = issues.filter(issue => {
    const status = issue.status || 'current';
    if (status === 'current' && includeCurrent) return true;
    if (status === 'parked' && includeParked) return true;
    if (status === 'completed' && includeCompleted) return true;
    return false;
  });
  
  filteredIssues.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(a.created_at) - new Date(b.created_at);
  });
  
  const currentIssues = filteredIssues.filter(i => (i.status || 'current') === 'current');
  const parkedIssues = filteredIssues.filter(i => i.status === 'parked');
  const completedIssues = filteredIssues.filter(i => i.status === 'completed');
  
  logger('Issues after filtering:', filteredIssues.length);
  logger('- Current:', currentIssues.length);
  logger('- Parked:', parkedIssues.length);
  logger('- Completed:', completedIssues.length);
  
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
  
  const generatedDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let headerText = `Generated: ${generatedDate} • Showing: ${statuses}`;
  if (filterDate) {
    const filterDateFormatted = new Date(filterDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    headerText += ` modified since: ${filterDateFormatted}`;
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
        content.push(...await generateIssueContent(issue, issueNumber));
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
        content.push(...await generateIssueContent(issue, issueNumber));
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
        content.push(...await generateIssueContent(issue, issueNumber));
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

async function generateIssueContent(issue, number) {
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

  const createdDate = new Date(issue.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  const createdBy = issue.created_by_profile?.full_name || 'Unknown';
  
  let dateInfo = `Created: ${createdDate} by ${createdBy}`;
  
  const createdTime = new Date(issue.created_at).getTime();
  const updatedTime = issue.updated_at ? new Date(issue.updated_at).getTime() : createdTime;
  
  if (updatedTime > createdTime) {
    const updatedDate = new Date(issue.updated_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const updatedBy = issue.updated_by_profile?.full_name || 'Unknown';
    dateInfo += ` • Modified: ${updatedDate} by ${updatedBy}`;
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

  // Filter activities by type for separate sections
  const commentActivities  = (issue.activities || []).filter(a => (a.activity_type ?? 'comment') === 'comment');
  const decisionActivities = (issue.activities || []).filter(a => a.activity_type === 'decision');

  if (commentActivities.length > 0) {
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Comments:",
            bold: true,
            size: 24
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    const sortedComments = [...commentActivities].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    for (const comment of sortedComments) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: comment.body,
              size: 22
            })
          ],
          spacing: { before: 60, after: 40, left: 360 }
        })
      );

      const commentCreatedDate = new Date(comment.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      const commentCreatedBy = comment.created_by_profile?.full_name || 'Unknown';
      
      let commentDateInfo = `Added: ${commentCreatedDate} by ${commentCreatedBy}`;
      
      const commentCreatedTime = new Date(comment.created_at).getTime();
      const commentUpdatedTime = comment.updated_at ? new Date(comment.updated_at).getTime() : commentCreatedTime;
      
      if (commentUpdatedTime > commentCreatedTime) {
        const commentUpdatedDate = new Date(comment.updated_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const commentUpdatedBy = comment.updated_by_profile?.full_name || 'Unknown';
        commentDateInfo += ` • Modified: ${commentUpdatedDate} by ${commentUpdatedBy}`;
      }

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: commentDateInfo,
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

  if (decisionActivities.length > 0) {
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Decisions:",
            bold: true,
            size: 24
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    const sortedDecisions = [...decisionActivities].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    for (const decision of sortedDecisions) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: decision.body,
              size: 22
            })
          ],
          spacing: { before: 60, after: 40, left: 360 }
        })
      );

      const dCreatedDate = new Date(decision.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      const dCreatedBy = decision.created_by_profile?.full_name || 'Unknown';
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Added: ${dCreatedDate} by ${dCreatedBy}`,
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
        const deadline = new Date(action.date_deadline).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        const isOverdue = new Date(action.date_deadline) < new Date();
        details.push(`📅 Due: ${deadline}${isOverdue ? ' ⚠️' : ''}`);
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

      const actionCreatedDate = new Date(action.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      const actionCreatedBy = action.created_by_profile?.full_name || 'Unknown';
      
      let actionDateInfo = `Added: ${actionCreatedDate} by ${actionCreatedBy}`;
      
      const actionCreatedTime = new Date(action.created_at).getTime();
      const actionUpdatedTime = action.updated_at ? new Date(action.updated_at).getTime() : actionCreatedTime;
      
      if (actionUpdatedTime > actionCreatedTime) {
        const actionUpdatedDate = new Date(action.updated_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const actionUpdatedBy = action.updated_by_profile?.full_name || 'Unknown';
        actionDateInfo += ` • Modified: ${actionUpdatedDate} by ${actionUpdatedBy}`;
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
