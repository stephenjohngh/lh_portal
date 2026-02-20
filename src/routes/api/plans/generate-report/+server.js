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

// Sort elements: by asset_id (numeric-aware), fallback to id
function sortElementsByName(a, b) {
  const idA = a.asset_id || '';
  const idB = b.asset_id || '';
  return idA.localeCompare(idB, undefined, { numeric: true });
}

export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-report — request received');

  try {
    logger('Step 1: Parsing request body');
    const { plan, elements, options } = await request.json();

    logger('Step 2: Parsed OK —', {
      planName: plan?.name,
      planBuilding: plan?.building,
      floorLevel: plan?.floor_level,
      elementCount: elements?.length,
      options
    });

    if (!plan || !elements || !options) {
      logger('❌ Missing required fields in request body');
      return json({ error: 'Missing plan, elements, or options' }, { status: 400 });
    }

    // Create document sections
    const docSections = [];
    logger('Step 3: Building document sections');

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

    logger('Step 4: Plan header sections built. includeElementList =', options.includeElementList, ', elements =', elements.length);

    // Element list
    if (options.includeElementList && elements.length > 0) {

      if (options.groupByType) {
        logger('Step 5: Building grouped-by-type tables');

        // Group by type
        const elementsByType = elements.reduce((acc, element) => {
          if (!acc[element.element_type]) {
            acc[element.element_type] = [];
          }
          acc[element.element_type].push(element);
          return acc;
        }, {});

        const sortedTypes = Object.keys(elementsByType).sort();
        logger('Step 5a: Types found —', sortedTypes);

        for (const type of sortedTypes) {
          logger(`Step 5b: Building table for type "${type}" (${elementsByType[type].length} elements)`);

          // Type heading
          docSections.push(
            new Paragraph({
              text: `${type.charAt(0).toUpperCase() + type.slice(1)}s (${elementsByType[type].length})`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            })
          );

          // Sort elements by asset_id (FIX: was a.name which doesn't exist)
          const sortedElements = [...elementsByType[type]].sort(sortElementsByName);

          // Header row
          const rows = [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Name', bold: true })] })],
                  width: { size: 20, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Label', bold: true })] })],
                  width: { size: 20, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Subtype', bold: true })] })],
                  width: { size: 15, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true })] })],
                  width: { size: 10, type: WidthType.PERCENTAGE }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Notes', bold: true })] })],
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
                  new TableCell({ children: [new Paragraph(getElementDisplayName(element, plan.floor_level))] }),
                  new TableCell({ children: [new Paragraph(element.label || '-')] }),
                  new TableCell({ children: [new Paragraph(element.subtype || '-')] }),
                  new TableCell({ children: [new Paragraph(element.status)] }),
                  new TableCell({ children: [new Paragraph(element.notes || '-')] })
                ]
              })
            );
          }

          docSections.push(
            new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top:             { style: BorderStyle.SINGLE, size: 1 },
                bottom:          { style: BorderStyle.SINGLE, size: 1 },
                left:            { style: BorderStyle.SINGLE, size: 1 },
                right:           { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical:  { style: BorderStyle.SINGLE, size: 1 }
              }
            })
          );

          docSections.push(new Paragraph({ text: '', spacing: { after: 200 } }));
          logger(`Step 5c: ✅ Table for "${type}" built`);
        }

      } else {
        logger('Step 5: Building flat (all elements) table');

        docSections.push(
          new Paragraph({
            text: 'All Elements',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          })
        );

        // Sort: type first, then asset_id (FIX: was a.name which doesn't exist)
        const sortedElements = [...elements].sort((a, b) => {
          if (a.element_type !== b.element_type) {
            return a.element_type.localeCompare(b.element_type);
          }
          return sortElementsByName(a, b);
        });

        logger('Step 5a: Sorted', sortedElements.length, 'elements');

        const rows = [
          // Header row
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Name', bold: true })] })],
                width: { size: 18, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Type', bold: true })] })],
                width: { size: 10, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Label', bold: true })] })],
                width: { size: 18, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Subtype', bold: true })] })],
                width: { size: 14, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true })] })],
                width: { size: 10, type: WidthType.PERCENTAGE }
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Notes', bold: true })] })],
                width: { size: 30, type: WidthType.PERCENTAGE }
              })
            ]
          })
        ];

        for (const element of sortedElements) {
          rows.push(
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(getElementDisplayName(element, plan.floor_level))] }),
                new TableCell({ children: [new Paragraph(element.element_type)] }),
                new TableCell({ children: [new Paragraph(element.label || '-')] }),
                new TableCell({ children: [new Paragraph(element.subtype || '-')] }),
                new TableCell({ children: [new Paragraph(element.status)] }),
                new TableCell({ children: [new Paragraph(element.notes || '-')] })
              ]
            })
          );
        }

        docSections.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:             { style: BorderStyle.SINGLE, size: 1 },
              bottom:          { style: BorderStyle.SINGLE, size: 1 },
              left:            { style: BorderStyle.SINGLE, size: 1 },
              right:           { style: BorderStyle.SINGLE, size: 1 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
              insideVertical:  { style: BorderStyle.SINGLE, size: 1 }
            }
          })
        );

        logger('Step 5b: ✅ Flat table built');
      }
    } else {
      logger('Step 5: Skipping element list (includeElementList =', options.includeElementList, ', elements =', elements.length, ')');
    }

    logger('Step 6: Creating Document object');
    const doc = new Document({
      sections: [{
        properties: {},
        children: docSections
      }]
    });

    logger('Step 7: Packing document to buffer');
    const buffer = await Packer.toBuffer(doc);

    logger('✅ Report generated successfully, buffer size:', buffer.byteLength);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${plan.building}_${plan.name}_Report.docx"`
      }
    });

  } catch (error) {
    logger('❌ Error generating report:', error.message);
    logger('❌ Stack:', error.stack);
    return json({ error: error.message }, { status: 500 });
  }
}
