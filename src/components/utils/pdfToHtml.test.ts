// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfToHtml } from './pdfToHtml';

/** A two-page A4 PDF printed by Chrome: headings, bold, italic, a bullet list (bullets drawn, not text), a numbered list, page numbers. */
const file = fileURLToPath(new URL('./__fixtures__/manual-sample.pdf', import.meta.url));

describe('pdfToHtml', () => {
    it('keeps headings, bold, paragraphs and lists, from every page', async () => {
        const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;
        const html = await pdfToHtml(pdf as never);
        expect(html).toContain('<h2>Safety Management System</h2>');
        expect(html).toMatch(/<h3>1\. Maintenance<\/h3>/);
        expect(html).toContain('<strong>maintenance procedures must be in place</strong>');
        expect(html).toMatch(/<ul><li>Proper upkeep[^<]*<\/li><li>Timely[^<]*second line[^<]*<\/li><li>Reduced repair costs\.<\/li><\/ul>/);
        expect(html).toMatch(/<ol><li>The Master reports defects\.<\/li><li>The Chief Engineer plans the work\.<\/li><\/ol>/);
        expect(html).toContain('<em>in full compliance</em>');
        expect(html).not.toMatch(/<p>\d<\/p>/); // page numbers left out
    });
});
