// src/routes/api/reports/generate-actions-docx/+server.js
// CLEANED: All console.log replaced with logger

import { json } from '@sveltejs/kit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
         AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType } from 'docx';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('GenerateActionsDocx');

export async function POST({ request }) {
  logger('Actions DOCX generation request received');

  try {
    logger('Parsing request body');
    const requestBody = await request.json();
    logger('✅ Request body parsed successfully');
    
    const { actions, selectedUser, userName } = requestBody;
    
    logger('Validating data');
    logger('Actions type:', typeof actions);
    logger('Actions is array:', Array.isArray(actions));
    logger('Actions count:', actions?.length || 0);
    logger('Selected user:', selectedUser);
    logger('User name:', userName);

    if (!actions) {
      logger('❌ No actions provided');
      return json({ error: 'No actions provided' }, { status: 400 });
    }

    if (!Array.isArray(actions)) {
      logger('❌ Actions is not an array');
      return json({ error: 'Actions must be an array' }, { status: 400 });
    }

    if (actions.length === 0) {
      logger('⚠️ No actions - returning 204');
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
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: generateReportContent(actions, userName)
      }]
    });

    logger('✅ Document structure created');

    logger('Generating buffer');
    const buffer = await Packer.toBuffer(doc);
    
    logger('✅ Buffer generated successfully');
    logger('Buffer size:', buffer.length, 'bytes (', (buffer.length / 1024).toFixed(2), 'KB)');

    const filename = selectedUser === 'all'
      ? `Actions_Report_All_Users_${new Date().toISOString().split('T')[0]}.docx`
      : selectedUser === 'unallocated'
      ? `Actions_Report_Unallocated_${new Date().toISOString().split('T')[0]}.docx`
      : `Actions_Report_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;

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
    logger('❌ Error generating actions report:', err.message);
    logger('Stack:', err.stack);
    
    return json({ 
      error: err.message,
      type: err.constructor.name,
      stack: err.stack
    }, { status: 500 });
  }
}

function generateReportContent(actions, userName) {
  logger('Generating report content');
  logger('Actions count:', actions.length);
  logger('User name:', userName);
  
  const content = [];
  
  try {
    logger('Adding report header');
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Actions Report")]
      })
    );
    
    const generatedDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    logger('Adding metadata paragraph');
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Generated: ${generatedDate} • Showing: ${userName} • ${actions.length} ${actions.length === 1 ? 'action' : 'actions'} (In-Progress, Pending)`,
            size: 20,
            color: "666666"
          })
        ],
        spacing: { after: 360 }
      })
    );

    logger('Processing', actions.length, 'actions');
    actions.forEach((action, index) => {
      logger('Processing action', index + 1, '/', actions.length);
      try {
        const actionContent = generateActionContent(action, index + 1);
        content.push(...actionContent);
      } catch (err) {
        logger('❌ Error processing action', index + 1, ':', err.message);
        throw err;
      }
    });

    logger('Adding footer');
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
    
  } catch (err) {
    logger('❌ Error in generateReportContent:', err.message);
    throw err;
  }
}

function generateActionContent(action, number) {
  const content = [];
  const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  try {
    content.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders,
                width: { size: 100, type: WidthType.PERCENTAGE },
                shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
                margins: { top: 120, bottom: 120, left: 180, right: 180 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${number}. ${action.action_text}`,
                        bold: true,
                        size: 26
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

    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Issue: `,
            size: 22,
            color: "666666"
          }),
          new TextRun({
            text: action.issue_name,
            size: 22,
            bold: true
          })
        ],
        spacing: { before: 120, after: 80 }
      })
    );

    const details = [];
    
    if (action.name_text) {
      details.push(`👤 Assigned to: ${action.name_text}`);
    }
    
    if (action.date_deadline) {
      const deadline = new Date(action.date_deadline).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const isOverdue = new Date(action.date_deadline) < new Date();
      details.push(`📅 Due: ${deadline}${isOverdue ? ' ⚠️ OVERDUE' : ''}`);
    }
    
    details.push(`Status: ${action.status}`);
    
    if (action.issue_status === 'parked') {
      details.push('🅿️ Issue is Parked');
    } else if (action.issue_status === 'completed') {
      details.push('✓ Issue is Completed');
    }

    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: details.join(' • '),
            size: 20,
            color: "666666"
          })
        ],
        spacing: { after: 80 }
      })
    );

    const createdDate = new Date(action.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const createdBy = action.created_by_profile?.full_name || 'Unknown';
    
    let dateInfo = `Added: ${createdDate} by ${createdBy}`;
    
    const createdTime = new Date(action.created_at).getTime();
    const updatedTime = action.updated_at ? new Date(action.updated_at).getTime() : null;
    
    if (updatedTime && Math.abs(updatedTime - createdTime) > 1000) {
      const updatedDate = new Date(action.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const updatedBy = action.updated_by_profile?.full_name || 'Unknown';
      dateInfo += ` • Modified: ${updatedDate} by ${updatedBy}`;
    }
    
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: dateInfo,
            size: 18,
            color: "999999",
            italics: true
          })
        ],
        spacing: { after: 360 }
      })
    );

    return content;
    
  } catch (err) {
    logger('❌ Error in generateActionContent for action', number, ':', err.message);
    throw err;
  }
}
