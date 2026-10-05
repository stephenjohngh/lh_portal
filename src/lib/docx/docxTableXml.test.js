import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { xmlText, runXml, cellXml, rowXml, tableXml, tableSlots, fillTablePlaceholders } from './docxTableXml.js';

const STYLE = { width: 1000, border: { size: 1, color: 'C8D0DC' }, margins: { top: 80, bottom: 80, left: 120, right: 120 } };

async function documentXml(buffer) {
  return (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string');
}

describe('text in a Word table', () => {
  it('escapes what XML would read as markup', () => {
    expect(xmlText('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;');
  });

  it('drops the control characters Word refuses a whole file for', () => {
    expect(xmlText('a\u0000b\u0007c\u000Bd\te\nf')).toBe('abcd\te\nf');
  });

  it('states only what differs from the document default (Arial 9pt)', () => {
    expect(runXml('x')).toBe('<w:r><w:t xml:space="preserve">x</w:t></w:r>');
    expect(runXml('x', { size: 18 })).not.toContain('<w:sz');
    expect(runXml('x', { bold: true, color: 'FFFFFF', size: 16 }))
      .toBe('<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">x</w:t></w:r>');
  });

  it('leaves a white cell unshaded and gives no cell its own borders or margins', () => {
    const c = cellXml(runXml('x'), 500, { fill: 'ffffff' });
    expect(c).not.toContain('<w:shd');
    expect(c).not.toContain('<w:tcBorders');
    expect(c).not.toContain('<w:tcMar');
  });
});

describe('placing the tables in a packed document', () => {
  async function packed(n) {
    const slots = tableSlots();
    const children = [new Paragraph({ children: [new TextRun('TEXT-BEFORE')] })];
    for (let i = 0; i < n; i++) {
      children.push(slots.placeholder(tableXml({ ...STYLE, columnWidths: [1000], rows: [rowXml([cellXml(runXml(`table ${i}`), 1000)])] })));
    }
    children.push(new Paragraph({ children: [new TextRun('TEXT-AFTER')] }));
    const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
    return { buffer, slots };
  }

  it('puts every table where its placeholder was, and leaves no placeholder', async () => {
    const { buffer, slots } = await packed(3);
    const xml = await documentXml(await fillTablePlaceholders(buffer, slots.tables));
    expect(xml).not.toContain('@@LH-TABLE');
    expect((xml.match(/<w:tbl>/g) ?? []).length).toBe(3);
    expect(xml.indexOf('TEXT-BEFORE')).toBeLessThan(xml.indexOf('table 0'));
    expect(xml.indexOf('table 0')).toBeLessThan(xml.indexOf('table 2'));
    expect(xml.indexOf('table 2')).toBeLessThan(xml.indexOf('TEXT-AFTER'));
  });

  it('refuses rather than produce a report with a table missing', async () => {
    const { buffer, slots } = await packed(2);
    await expect(fillTablePlaceholders(buffer, [...slots.tables, '<w:tbl/>'])).rejects.toThrow(/3 built, 2 placed/);
  });
});
