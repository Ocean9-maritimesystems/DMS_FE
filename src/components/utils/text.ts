/**
 * Plain text from a piece of HTML, e.g. a search snippet cut out of a manual's HTML (it can start or end in the
 * middle of a tag). Uses DOMParser, which builds an inert document: no scripts run and no images load.
 */
export const htmlToText = (html: string | null | undefined): string => {
    if (!html) return '';
    // Only HTML gets its cut-off tags removed: plain text such as "pressure > 5 bar" is left alone.
    const withoutPartialTags = !html.includes('<') ? html : html
        .replace(/^[^<]*?>/, '') // a tag cut at the start: "...style='x'>text"
        .replace(/<[^>]*$/, ''); // a tag cut at the end: "text<span sty"
    const doc = new DOMParser().parseFromString(withoutPartialTags, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
};

/** The words of a search query (as the API matches them: every word, case-insensitive). */
export const queryWords = (query: string): string[] =>
    Array.from(new Set(query.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 0))).slice(0, 6);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text split into parts, with `match` set on the parts that are one of the words (for <mark>). */
export const highlightParts = (text: string, words: string[]): { text: string; match: boolean }[] => {
    if (!text || words.length === 0) return [{ text, match: false }];
    const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
    return text
        .split(pattern)
        .filter((part) => part.length > 0)
        .map((part) => ({ text: part, match: words.some((w) => w.toLowerCase() === part.toLowerCase()) }));
};
