import { describe, it, expect } from 'vitest';
import { tidyWordBullets } from './wordBullets';
import { sanitizeHtml } from './sanitize';

const B = '\uF0B7';

describe('tidyWordBullets', () => {
    it('turns bullets typed inside one paragraph into a list after the lead text', () => {
        const html = `<p>Good procedures provide for: ${B} Proper upkeep. ${B} Timely execution. ${B} Reduced costs.</p>`;
        expect(tidyWordBullets(html)).toBe('<p>Good procedures provide for: </p><ul><li>Proper upkeep.</li><li>Timely execution.</li><li>Reduced costs.</li></ul>');
    });

    it('joins Word list paragraphs in a row into one list and drops the typed bullet', () => {
        const html = '<p>Intro</p>'
            + '<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>One</p>'
            + '<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Two</p>'
            + '<p>After</p>';
        expect(tidyWordBullets(html)).toBe('<p>Intro</p><ul><li>One</li><li>Two</li></ul><p>After</p>');
    });

    it('shows a single leftover Symbol bullet as a normal bullet and leaves other HTML alone', () => {
        expect(tidyWordBullets(`<p>${B} Only one</p>`)).toBe('<p>• Only one</p>');
        const plain = '<p>Nothing <b>to</b> change</p><ul><li>a</li></ul>';
        expect(tidyWordBullets(plain)).toBe(plain);
    });

    it('is part of sanitizeHtml', () => {
        expect(sanitizeHtml(`<p>For: ${B} a ${B} b</p><script>x()</script>`)).toBe('<p>For: </p><ul><li>a</li><li>b</li></ul>');
    });
});
