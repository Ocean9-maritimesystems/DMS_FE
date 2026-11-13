/**
 * Text pasted from Word often keeps Word's own bullets: characters of the Symbol / Wingdings fonts
 * (U+F0B7, U+F0A7, ...) that other fonts show as empty boxes, and "fake" lists (paragraphs marked mso-list with
 * the bullet typed in front). tidyWordBullets turns both into real lists:
 *
 *   - Word list paragraphs (class MsoListParagraph..., or style mso-list:) in a row become one <ul> with <li>s.
 *   - A paragraph with two or more Symbol bullets inside it ("provide for:  upkeep  safe execution ...")
 *     becomes the text before the first bullet, then a <ul> with one <li> per bullet.
 *   - Any other Symbol bullet left over is shown as a normal bullet "•".
 *
 * It is used when a manual is shown (so manuals saved before look right) and when it is saved from the editor.
 * HTML without such bullets is returned unchanged.
 */

/** Private-use characters Word's Symbol and Wingdings fonts use for bullets. */
const SYMBOL_BULLETS = '\uFFFD\uF0B7\uF0A7\uF0D8\uF076\uF0FC\uF0A8\uF06E\uF071\uF0E8\uF0A4\uF0B2';
const SYMBOL_RE = new RegExp(`[${SYMBOL_BULLETS}]`, 'g');
const SYMBOL_TEST = new RegExp(`[${SYMBOL_BULLETS}]`);

const isWordListParagraph = (el: Element): boolean =>
    el.tagName === 'P' && (/MsoList/i.test(el.getAttribute('class') ?? '') || /mso-list\s*:/i.test(el.getAttribute('style') ?? ''));

/** The bullet Word types in front of a list paragraph: <span style="mso-list:Ignore">·<span>&nbsp;</span></span>. */
const removeWordMarker = (el: Element) => {
    el.querySelectorAll('span').forEach((s) => {
        if (/mso-list\s*:\s*ignore/i.test(s.getAttribute('style') ?? '')) s.remove();
    });
    // A marker typed as plain text: "·", "o", "§", a Symbol bullet or "•" followed by spaces.
    const first = el.firstChild;
    if (first && first.nodeType === 3) {
        first.textContent = (first.textContent ?? '').replace(new RegExp(`^\\s*(?:[·•o§\\-${SYMBOL_BULLETS}])\\s+`), '');
    }
};

const toListItem = (doc: Document, from: Element): HTMLLIElement => {
    const li = doc.createElement('li');
    while (from.firstChild) li.appendChild(from.firstChild);
    return li;
};

/** Consecutive Word list paragraphs become one <ul>. */
const convertWordListParagraphs = (doc: Document, root: Element) => {
    const paragraphs = Array.from(root.querySelectorAll('p')).filter(isWordListParagraph);
    let list: HTMLUListElement | null = null;
    let last: Element | null = null;
    paragraphs.forEach((p) => {
        removeWordMarker(p);
        if (!list || last?.nextElementSibling !== p) {
            list = doc.createElement('ul');
            p.parentNode?.insertBefore(list, p);
        }
        list.appendChild(toListItem(doc, p));
        last = list;
        p.remove();
    });
};

/** A block with two or more Symbol bullets inside becomes its lead text and a list. */
const splitInlineBullets = (doc: Document, root: Element) => {
    const blocks = Array.from(root.querySelectorAll('p, div, li')).filter((el) => {
        if (el.querySelector('p, div, ul, ol, table')) return false; // only blocks holding text
        return ((el.textContent ?? '').match(SYMBOL_RE) ?? []).length >= 2;
    });
    blocks.forEach((block) => {
        const parts = block.innerHTML.split(SYMBOL_RE);
        const lead = parts.shift() ?? '';
        const items = parts.map((p) => p.replace(/^(\s|&nbsp;)+|(\s|&nbsp;)+$/g, '')).filter((p) => p.replace(/<[^>]*>/g, '').trim().length > 0);
        if (items.length < 2) return;
        const ul = doc.createElement('ul');
        ul.innerHTML = items.map((i) => `<li>${i}</li>`).join('');
        if (block.tagName === 'LI') {
            // a list item with bullets inside: keep the lead in the item, the rest as a sub-list
            block.innerHTML = lead;
            block.appendChild(ul);
            return;
        }
        const parent = block.parentNode;
        if (!parent) return;
        if (lead.replace(/<[^>]*>|&nbsp;/g, '').trim()) {
            const p = doc.createElement(block.tagName.toLowerCase());
            p.innerHTML = lead;
            parent.insertBefore(p, block);
        }
        parent.insertBefore(ul, block);
        block.remove();
    });
};

export const hasWordBullets = (html: string | null | undefined): boolean =>
    !!html && (SYMBOL_TEST.test(html) || /MsoList|mso-list\s*:/i.test(html));

export const tidyWordBullets = (html: string): string => {
    if (!hasWordBullets(html) || typeof DOMParser === 'undefined') return html;
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const root = doc.body;
    convertWordListParagraphs(doc, root);
    splitInlineBullets(doc, root);
    // Leftovers (a single bullet in a paragraph): a normal bullet instead of an empty box.
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent && SYMBOL_TEST.test(n.textContent)) n.textContent = n.textContent.replace(SYMBOL_RE, '•');
    }
    return root.innerHTML;
};
