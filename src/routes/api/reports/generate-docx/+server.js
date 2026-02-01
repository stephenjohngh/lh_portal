// src/routes/api/reports/generate-docx/+server.js
import { json } from '@sveltejs/kit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
         AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
         VerticalAlign, PageBreak } from 'docx';

export async function POST({ request }) {
  console.log('\n========================================');
  console.log('📄 DOCX GENERATION REQUEST RECEIVED');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  try {
    console.log('📥 Parsing request body...');
    const { issues, filterDate, includeCurrent, includeParked, includeCompleted } = await request.json();
    
    console.log('✅ Request parsed successfully');
    console.log('📊 Issues count:', issues?.length || 0);
    console.log('📅 Filter date:', filterDate || 'none');
    console.log('🎯 Filters:', { includeCurrent, includeParked, includeCompleted });

    if (!issues || issues.length === 0) {
      console.warn('⚠️ No issues provided in request - doing nothing');
      return new Response('', { status: 204 }); // No Content
    }

    console.log('🏗️ Creating document structure...');
    
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
              top: 720,    // 0.5 inch (was 1 inch)
              right: 720,  // 0.5 inch (was 1 inch)
              bottom: 720, // 0.5 inch (was 1 inch)
              left: 720    // 0.5 inch (was 1 inch)
            }
          }
        },
        children: await generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted)
      }]
    });

    console.log('✅ Document structure created');
    console.log('📦 Generating buffer...');

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);
    
    console.log('✅ Buffer generated successfully');
    console.log('📏 Buffer size:', buffer.length, 'bytes');
    console.log('📏 Buffer size (KB):', (buffer.length / 1024).toFixed(2), 'KB');

    const filename = `Issues_Report_${new Date().toISOString().split('T')[0]}.docx`;
    console.log('📁 Filename:', filename);

    console.log('🚀 Sending response...');
    console.log('========================================\n');

    // Return as downloadable file
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (err) {
    console.error('\n========================================');
    console.error('❌ ERROR GENERATING DOCX');
    console.error('========================================');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('========================================\n');
    
    return json({ 
      error: err.message,
      type: err.constructor.name,
      stack: err.stack
    }, { status: 500 });
  }
}

async function generateReportContent(issues, filterDate, includeCurrent, includeParked, includeCompleted) {
  console.log('📝 Generating report content...');
  console.log('   Total issues provided:', issues.length);
  console.log('   Filters:', { includeCurrent, includeParked, includeCompleted });
  
  // Filter issues by status based on what's selected
  let filteredIssues = issues.filter(issue => {
    const status = issue.status || 'current';
    if (status === 'current' && includeCurrent) return true;
    if (status === 'parked' && includeParked) return true;
    if (status === 'completed' && includeCompleted) return true;
    return false;
  });
  
  // Sort by priority first, then by created_at
  filteredIssues.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(a.created_at) - new Date(b.created_at);
  });
  
  // Group by status
  const currentIssues = filteredIssues.filter(i => (i.status || 'current') === 'current');
  const parkedIssues = filteredIssues.filter(i => i.status === 'parked');
  const completedIssues = filteredIssues.filter(i => i.status === 'completed');
  
  console.log('   Issues after filtering:', filteredIssues.length);
  console.log('   - Current:', currentIssues.length);
  console.log('   - Parked:', parkedIssues.length);
  console.log('   - Completed:', completedIssues.length);
  
  const content = [];
  
  // Report header
  console.log('   Adding report header...');
  content.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun("Issues Report")]
    })
  );
  
  // Generated date and filter summary on same line
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
  
  // Format filter date if present
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

  // Add issues by status group
  console.log('   Processing issues...');
  let issueNumber = 1;
  
  // Current issues
  if (currentIssues.length > 0) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Current Issues")],
        spacing: { after: 240 }
      })
    );
    
    for (const issue of currentIssues) {
      console.log(`   - Issue ${issueNumber}: ${issue.name?.substring(0, 50)}...`);
      try {
        content.push(...await generateIssueContent(issue, issueNumber));
        issueNumber++;
      } catch (err) {
        console.error(`   ❌ Error processing issue ${issueNumber}:`, err.message);
        throw err;
      }
    }
  }
  
  // Parked issues
  if (parkedIssues.length > 0) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Parked Issues")],
        spacing: { before: 480, after: 240 }
      })
    );
    
    for (const issue of parkedIssues) {
      console.log(`   - Issue ${issueNumber}: ${issue.name?.substring(0, 50)}...`);
      try {
        content.push(...await generateIssueContent(issue, issueNumber));
        issueNumber++;
      } catch (err) {
        console.error(`   ❌ Error processing issue ${issueNumber}:`, err.message);
        throw err;
      }
    }
  }
  
  // Completed issues
  if (completedIssues.length > 0) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Completed Issues")],
        spacing: { before: 480, after: 240 }
      })
    );
    
    for (const issue of completedIssues) {
      console.log(`   - Issue ${issueNumber}: ${issue.name?.substring(0, 50)}...`);
      try {
        content.push(...await generateIssueContent(issue, issueNumber));
        issueNumber++;
      } catch (err) {
        console.error(`   ❌ Error processing issue ${issueNumber}:`, err.message);
        throw err;
      }
    }
  }

  console.log('   Adding report footer...');
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

  console.log('✅ Report content generated:', content.length, 'elements');
  return content;
}

async function generateIssueContent(issue, number) {
  const content = [];
  const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  // Calculate column widths in DXA (1440 DXA = 1 inch)
  // US Letter with 0.5" margins: 12240 - 1440 = 10800 DXA content width
  // Title: 9300 DXA (~86%), Priority: 1500 DXA (~14%)
  const titleWidth = 9300;
  const priorityWidth = 1500;
  
  // Issue header table - title and small priority badge
  const headerCells = [
    // Issue name (no number)
    new TableCell({
      borders,
      width: { size: titleWidth, type: WidthType.DXA },
      shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: issue.name,
              bold: true,
              size: 26
            })
          ]
        })
      ]
    }),
    // Priority badge (1500 DXA)
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
              size: 18, // 9pt
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

  // Created and updated dates with usernames
  const createdDate = new Date(issue.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  const createdBy = issue.created_by_profile?.full_name || 'Unknown';
  
  let dateInfo = `Created: ${createdDate} by ${createdBy}`;
  
  // Only add modified info if it exists and is ACTUALLY different from created
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

  // Comments
  if (issue.comments && issue.comments.length > 0) {
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

      const commentCreatedDate = new Date(comment.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      const commentCreatedBy = comment.created_by_profile?.full_name || 'Unknown';
      
      let commentDateInfo = `Added: ${commentCreatedDate} by ${commentCreatedBy}`;
      
      // Only add modified info if it exists and is ACTUALLY different from created
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

      const actionCreatedDate = new Date(action.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      const actionCreatedBy = action.created_by_profile?.full_name || 'Unknown';
      
      let actionDateInfo = `Added: ${actionCreatedDate} by ${actionCreatedBy}`;
      
      // Only add modified info if it exists and is ACTUALLY different from created
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
    1: "Top Priority",
    2: "Major Project",
    3: "Important",
    4: "Minor",
    5: "Pending"
  };
  return labels[priority] || `Priority ${priority}`;
}

function getPriorityColorHex(priority) {
  // Using neutral gray colors for all priorities as per the established design
  const colors = {
    1: "475569", // Slate 600
    2: "475569", // Slate 600
    3: "475569", // Slate 600
    4: "475569", // Slate 600
    5: "475569"  // Slate 600
  };
  return colors[priority] || "6B7280";
}
