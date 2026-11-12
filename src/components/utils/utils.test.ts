import { highlightParts, htmlToText, queryWords } from './text';
import { canOpenInBrowser, escapeHtml, sanitizeHtml } from './sanitize';
import { itemLink } from '../../config/itemLinks';

describe('search snippets', () => {
    test('HTML cut in the middle of tags becomes plain text', () => {
        expect(htmlToText('le="color:red">The <b>ballast</b> water<img src=x onerror="x()"> check.<sp')).toBe('The ballast water check.');
    });

    test('plain text keeps its ">" and "<"-free content', () => {
        expect(htmlToText('Pressure > 5 bar must be reported')).toBe('Pressure > 5 bar must be reported');
    });

    test('query words are matched case-insensitively', () => {
        expect(queryWords('  Ballast  water ballast ')).toEqual(['Ballast', 'water', 'ballast']);
        const parts = highlightParts('The ballast Water system', ['ballast', 'water']);
        expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['ballast', 'Water']);
    });

    test('regex characters in a query are taken literally', () => {
        expect(highlightParts('a (b) c', ['(b)']).find((p) => p.match)?.text).toBe('(b)');
    });
});

describe('sanitising', () => {
    test('scripts, event handlers and javascript: links are removed', () => {
        const clean = sanitizeHtml('<p onclick="x()">Hi</p><script>bad()</script><a href="javascript:bad()">l</a><img src=x onerror="bad()">');
        expect(clean).not.toMatch(/script|onclick|onerror|javascript:/i);
        expect(clean).toContain('<p>Hi</p>');
    });

    test('formatting is kept', () => {
        expect(sanitizeHtml('<table><tr><td style="color: red">x</td></tr></table>')).toContain('style="color: red"');
    });

    test('text is escaped for HTML', () => {
        expect(escapeHtml('<b>"a" & b</b>')).toBe('&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;');
    });

    test('only PDFs, images and text open in the browser', () => {
        expect(canOpenInBrowser('application/pdf')).toBe(true);
        expect(canOpenInBrowser('image/png')).toBe(true);
        expect(canOpenInBrowser('text/html')).toBe(false);
        expect(canOpenInBrowser('image/svg+xml')).toBe(false);
        expect(canOpenInBrowser(undefined)).toBe(false);
    });
});

describe('item links', () => {
    test('manuals, circulars and alerts open their page; others have none', () => {
        expect(itemLink('Manual', 12)).toBe('/manuals?id=12');
        expect(itemLink('Circular', 5)).toBe('/circulars?cirmode=circulars&id=5');
        expect(itemLink('alert', 6)).toBe('/circulars?cirmode=alerts&id=6');
        expect(itemLink('Suggestion', 8)).toBe('/suggestions?id=8');
        expect(itemLink('Document', 9)).toBeNull();
    });
});
