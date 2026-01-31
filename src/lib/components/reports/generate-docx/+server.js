// src/routes/api/reports/generate-docx/+server.js
import { json } from '@sveltejs/kit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
         AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
         PageBreak } from 'docx';

export async function POST({ request }) {
  try {
    const { issues, filterDate, includeCurrent, includeParked, includeCompleted } = await request.json();
    
    console.log('Generating DOCX report for', issues.length, 'issues');

    // Create document
    const doc = new Document({
      styles: {
        default: { 
          document: { 
            run: { font: "Arial", size: 24 } // 12pt
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
              width: 12240,   // US Letter
              height: 15840
            },
            margin: { 
              top: 1440,    // 1 inch
              right: 1440, 
              bottom: 1440, 
              left: 1440 
            }
          }
        },
        children: await generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted)
      }]
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Return as downloadable file
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Issues_Report_${new Date().toISOString().split('T')[0]}.docx"`
      }
    });

  } catch (err) {
    console.error('Error generating DOCX:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

async function generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted) {
  const content = [];
  
  // Report header
  content.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun("Issues Report")]
    })
  );
  
  // Generated date
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}`,
          size: 20,
          color: "666666"
        })
      ],
      spacing: { after: 120 }
    })
  );
  
  // Filter summary
  const statuses = [
    includeCurrent && 'Current',
    includeParked && 'Parked',
    includeCompleted && 'Completed'
  ].filter(Boolean).join(', ');
  
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Showing: ${statuses} • Total: ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`,
          size: 20,
          color: "666666"
        })
      ],
      spacing: { after: 360 }
    })
  );

  // Add each issue
  let issueNumber = 1;
  for (const issue of issues) {
    content.push(...await generateIssueContent(issue, issueNumber));
    issueNumber++;
  }

  // Report footer
  content.push(
    new Paragraph({
      children: [new PageBreak()]
    })
  );
  
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
      spacing: { before: 240 }
    })
  );

  return content;
}

async function generateIssueContent(issue, number) {
  const content = [];
  const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  // Issue header table
  const headerCells = [
    // Number and title
    new TableCell({
      borders,
      width: { size: 70, type: WidthType.PERCENTAGE },
      shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: `${number}. ${issue.name}`,
              bold: true,
              size: 26
            })
          ]
        })
      ]
    }),
    // Priority
    new TableCell({
      borders,
      width: { size: 30, type: WidthType.PERCENTAGE },
      shading: { fill: getPriorityColor(issue.priority), type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: getPriorityLabel(issue.priority),
              bold: true,
              size: 22,
              color: "FFFFFF"
            })
          ],
          alignment: AlignmentType.CENTER
        })
      ]
    })
  ];
  
  // Add status badge if needed
  if (issue.status === 'parked') {
    headerCells.push(
      new TableCell({
        borders,
        width: { size: 20, type: WidthType.PERCENTAGE },
        shading: { fill: "F59E0B", type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "🅿️ Parked",
                bold: true,
                size: 20,
                color: "FFFFFF"
              })
            ],
            alignment: AlignmentType.CENTER
          })
        ]
      })
    );
  } else if (issue.status === 'completed') {
    headerCells.push(
      new TableCell({
        borders,
        width: { size: 20, type: WidthType.PERCENTAGE },
        shading: { fill: "10B981", type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "✓ Completed",
                bold: true,
                size: 20,
                color: "FFFFFF"
              })
            ],
            alignment: AlignmentType.CENTER
          })
        ]
      })
    );
  }

  content.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: headerCells
        })
      ]
    })
  );

  // Description
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

  // Created date and metadata
  const createdDate = new Date(issue.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  const outstandingCount = (issue.outstandingActions || []).length;
  
  content.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Created: ${createdDate} • Priority: ${issue.priority}`,
          size: 18,
          color: "666666"
        }),
        ...(outstandingCount > 0 ? [
          new TextRun({
            text: ` • ${outstandingCount} outstanding ${outstandingCount === 1 ? 'action' : 'actions'}`,
            size: 18,
            color: "666666"
          })
        ] : [])
      ],
      spacing: { after: 180 }
    })
  );

  // Comments
  if (issue.comments && issue.comments.length > 0) {
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Comments (${issue.comments.length}):`,
            bold: true,
            size: 24
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    const sortedComments = [...issue.comments].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    for (const comment of sortedComments) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: comment.comment_text,
              size: 22
            })
          ],
          spacing: { before: 60, after: 40, left: 360 }
        })
      );

      const commentDate = new Date(comment.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Added: ${commentDate}`,
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

  // Outstanding Actions
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

      const actionDate = new Date(action.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Added: ${actionDate}`,
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

  // Spacing between issues
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
    1: "Critical",
    2: "High",
    3: "Medium",
    4: "Low"
  };
  return labels[priority] || `Priority ${priority}`;
}

function getPriorityColor(priority) {
  const colors = {
    1: "DC2626", // Red
    2: "EA580C", // Orange
    3: "D97706", // Amber
    4: "059669"  // Green
  };
  return colors[priority] || "6B7280";
}
