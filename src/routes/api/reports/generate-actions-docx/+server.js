// src/routes/api/reports/generate-actions-docx/+server.js
import { json } from '@sveltejs/kit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
         AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType } from 'docx';

export async function POST({ request }) {
  console.log('\n========================================');
  console.log('📄 ACTIONS DOCX GENERATION REQUEST');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  try {
    console.log('📥 Step 1: Parsing request body...');
    const requestBody = await request.json();
    console.log('✅ Request body parsed successfully');
    console.log('   Keys in body:', Object.keys(requestBody));
    
    const { actions, selectedUser, userName } = requestBody;
    
    console.log('📊 Step 2: Validating data...');
    console.log('   actions type:', typeof actions);
    console.log('   actions is array:', Array.isArray(actions));
    console.log('   actions count:', actions?.length || 0);
    console.log('   selectedUser:', selectedUser);
    console.log('   userName:', userName);

    if (!actions) {
      console.error('❌ No actions provided');
      return json({ error: 'No actions provided' }, { status: 400 });
    }

    if (!Array.isArray(actions)) {
      console.error('❌ Actions is not an array');
      return json({ error: 'Actions must be an array' }, { status: 400 });
    }

    if (actions.length === 0) {
      console.warn('⚠️ No actions - returning 204');
      return new Response('', { status: 204 });
    }

    console.log('📋 Step 3: Sample action data...');
    console.log('   First action:', JSON.stringify(actions[0], null, 2));

    console.log('🏗️ Step 4: Creating document structure...');
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

    console.log('✅ Document structure created');

    console.log('📦 Step 5: Generating buffer...');
    const buffer = await Packer.toBuffer(doc);
    
    console.log('✅ Buffer generated successfully');
    console.log('   Buffer size:', buffer.length, 'bytes');
    console.log('   Buffer size:', (buffer.length / 1024).toFixed(2), 'KB');

    const filename = selectedUser === 'all'
      ? `Actions_Report_All_Users_${new Date().toISOString().split('T')[0]}.docx`
      : selectedUser === 'unallocated'
      ? `Actions_Report_Unallocated_${new Date().toISOString().split('T')[0]}.docx`
      : `Actions_Report_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;

    console.log('📁 Step 6: Preparing response...');
    console.log('   Filename:', filename);

    console.log('✅ SUCCESS - Sending response');
    console.log('========================================\n');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (err) {
    console.error('\n========================================');
    console.error('❌ ERROR GENERATING ACTIONS REPORT');
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

function generateReportContent(actions, userName) {
  console.log('\n📝 generateReportContent called');
  console.log('   Actions count:', actions.length);
  console.log('   User name:', userName);
  
  const content = [];
  
  try {
    console.log('   Adding report header...');
    // Report header
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Actions Report")]
      })
    );
    console.log('   ✅ Header added');
    
    // Generated date and user filter
    const generatedDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    console.log('   Generated date:', generatedDate);
    
    console.log('   Adding metadata paragraph...');
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
    console.log('   ✅ Metadata added');

    // Add each action
    console.log('   Processing', actions.length, 'actions...');
    actions.forEach((action, index) => {
      console.log(`   Processing action ${index + 1}/${actions.length}:`, action.action_text?.substring(0, 50));
      try {
        const actionContent = generateActionContent(action, index + 1);
        console.log(`   - Generated ${actionContent.length} content elements`);
        content.push(...actionContent);
      } catch (err) {
        console.error(`   ❌ Error processing action ${index + 1}:`, err.message);
        throw err;
      }
    });
    console.log('   ✅ All actions processed');

    // Footer
    console.log('   Adding footer...');
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
    console.log('   ✅ Footer added');

    console.log('✅ generateReportContent complete:', content.length, 'elements');
    return content;
    
  } catch (err) {
    console.error('❌ Error in generateReportContent:', err.message);
    console.error('   Stack:', err.stack);
    throw err;
  }
}

function generateActionContent(action, number) {
  console.log(`\n     🔧 generateActionContent for action #${number}`);
  console.log('        Action text:', action.action_text);
  console.log('        Issue name:', action.issue_name);
  console.log('        Assignee:', action.name_text);
  console.log('        Due date:', action.date_deadline);
  console.log('        Status:', action.status);
  
  const content = [];
  const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  
  try {
    console.log('        Creating action header table...');
    // Action header with number and text
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
    console.log('        ✅ Header table added');

    console.log('        Adding issue name...');
    // Issue name
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
    console.log('        ✅ Issue name added');

    console.log('        Building action details...');
    // Action details (assignee, due date, status, issue status)
    const details = [];
    
    if (action.name_text) {
      details.push(`👤 Assigned to: ${action.name_text}`);
      console.log('        - Assignee added');
    }
    
    if (action.date_deadline) {
      const deadline = new Date(action.date_deadline).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const isOverdue = new Date(action.date_deadline) < new Date();
      details.push(`📅 Due: ${deadline}${isOverdue ? ' ⚠️ OVERDUE' : ''}`);
      console.log('        - Due date added:', deadline);
    }
    
    details.push(`Status: ${action.status}`);
    console.log('        - Status added');
    
    if (action.issue_status === 'parked') {
      details.push('🅿️ Issue is Parked');
      console.log('        - Parked badge added');
    } else if (action.issue_status === 'completed') {
      details.push('✓ Issue is Completed');
      console.log('        - Completed badge added');
    }

    console.log('        Adding details paragraph...');
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
    console.log('        ✅ Details added');

    console.log('        Building date info...');
    // Created/Modified dates
    const createdDate = new Date(action.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const createdBy = action.created_by_profile?.full_name || 'Unknown';
    console.log('        - Created:', createdDate, 'by', createdBy);
    
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
      console.log('        - Modified:', updatedDate, 'by', updatedBy);
    }
    
    console.log('        Adding date info paragraph...');
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
    console.log('        ✅ Date info added');

    console.log(`     ✅ Action #${number} complete: ${content.length} elements`);
    return content;
    
  } catch (err) {
    console.error(`     ❌ Error in generateActionContent for action #${number}:`, err.message);
    console.error('        Stack:', err.stack);
    throw err;
  }
}
