// src/routes/api/plans/generate-report/+server.js
// Generate Word document report for floor plan

import { json } from '@sveltejs/kit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('generatePlanReport');

// Derived display name: "floor_level / asset_id"
function getElementDisplayName(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const id    = element.asset_id ? element.asset_id : 'No ID';
  return `${floor} / ${id}`;
}

export async function POST({ request }) {
  try {
    const { plan, elements, options } = await request.json();
    
    logger('Generating report for plan:', plan.name);
    logger('Elements count:', elements.length);
    logger('Options:', options);
    
    // Create document sections
    const docSections = [];
    
    // Title
    docSections.push(
      new Paragraph({
        text: `Floor Plan Report`,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 }
      })
    );
    
    // Plan details
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Plan: ', bold: true }),
          new TextRun(plan.name)
        ],
        spacing: { after: 100 }
      })
    );
    
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Building: ', bold: true }),
          new TextRun(plan.building)
        ],
        spacing: { after: 100 }
      })
    );
    
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Floor Level: ', bold: true }),
          new TextRun(String(plan.floor_level))
        ],
        spacing: { after: 100 }
      })
    );
    
    if (plan.description) {
      docSections.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Description: ', bold: true }),
            new TextRun(plan.description)
          ],
          spacing: { after: 200 }
        })
      );
    }
    
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Total Elements: ', bold: true }),
          new TextRun(String(elements.length))
        ],
        spacing: { after: 400 }
      })
    );
    
    // Element list
    if (options.includeElementList && elements.length > 0) {
      if (options.groupByType) {
        // Group by type
        const elementsByType = elements.reduce((acc, element) => {
          if (!acc[element.element_type]) {
            acc[element.element_type] = [];
          }
          acc[element.element_type].push(element);
          return acc;
        }, {});
        
        const sortedTypes = Object.keys(elementsByType).sort();
        
        for (const type of sortedTypes) {
          // Type heading
          docSections.push(
            new Paragraph({
              text: `${type.charAt(0).toUpperCase() + type.slice(1)}s (${elementsByType[type].length})`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            })
          );
          
          // Sort elements by name
          const sortedElements = elementsByType[type].sort((a, b) => a.name.localeCompare(b.name));
          
          // Create table for this type
          const rows = [
            // Header row
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({
                  children: [new Paragraph({ text: 'Name', bold: true })],
                  width: { size: 20, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Label', bold: true })],
                  width: { size: 20, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Subtype', bold: true })],
                  width: { size: 15, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Status', bold: true })],
                  width: { size: 10, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Notes', bold: true })],
                  width: { size: 35, type: WidthType.PERCENTAGE }
                })
              ]
            })
          ];
          
          // Data rows
          for (const element of sortedElements) {
            rows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph(getElementDisplayName(element, plan.floor_level))]
                  }),
                  new TableCell({
                    children: [new Paragraph(element.label || '-')]
                  }),
                  new TableCell({
                    children: [new Paragraph(element.subtype || '-')]
                  }),
                  new TableCell({
                    children: [new Paragraph(element.status)]
                  }),
                  new TableCell({
                    children: [new Paragraph(element.notes || '-')]
                  })
                ]
              })
            );
          }
          
          docSections.push(
            new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical: { style: BorderStyle.SINGLE, size: 1 }
              }
            })
          );
          
          docSections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
        }
      } else {
        // Single table with all elements
        docSections.push(
          new Paragraph({
            text: 'All Elements',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          })
        );
        
        const sortedElements = [...elements].sort((a, b) => {
          if (a.element_type !== b.element_type) {
            return a.element_type.localeCompare(b.element_type);
          }
          return a.name.localeCompare(b.name);
        });
        
        const rows = [
          // Header row
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({
                children: [new Paragraph({ text: 'Name', bold: true })],
                width: { size: 18, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ text: 'Type', bold: true })],
                width: { size: 10, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ text: 'Label', bold: true })],
                width: { size: 18, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ text: 'Subtype', bold: true })],
                width: { size: 14, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ text: 'Status', bold: true })],
                width: { size: 10, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ text: 'Notes', bold: true })],
                width: { size: 30, type: WidthType.PERCENTAGE }
              })
            ]
          })
        ];
        
        for (const element of sortedElements) {
          rows.push(
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph(getElementDisplayName(element, plan.floor_level))]
                }),
                new TableCell({
                  children: [new Paragraph(element.element_type)]
                }),
                new TableCell({
                  children: [new Paragraph(element.label || '-')]
                }),
                new TableCell({
                  children: [new Paragraph(element.subtype || '-')]
                }),
                new TableCell({
                  children: [new Paragraph(element.status)]
                }),
                new TableCell({
                  children: [new Paragraph(element.notes || '-')]
                })
              ]
            })
          );
        }
        
        docSections.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
              insideVertical: { style: BorderStyle.SINGLE, size: 1 }
            }
          })
        );
      }
    }
    
    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: docSections
      }]
    });
    
    // Generate buffer
    const buffer = await Packer.toBuffer(doc);
    
    logger('✅ Report generated successfully');
    
    // Return as downloadable file
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${plan.building}_${plan.name}_Report.docx"`
      }
    });
    
  } catch (error) {
    logger('❌ Error generating report:', error.message);
    return json({ error: error.message }, { status: 500 });
  }
}
