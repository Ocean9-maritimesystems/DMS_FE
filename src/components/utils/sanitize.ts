import DOMPurify from 'dompurify';

/**
 * Manual text is HTML written in the editor and stored as it was typed or pasted. Before it is shown or saved,
 * anything that could run code is removed: <script>, event handlers (onerror=, onclick=...), javascript: links,
 * <iframe>/<object>/<embed>, forms. Formatting (tables, styles, images, links) stays.
 */
const MANUAL_HTML_CONFIG = {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'base', 'meta', 'link'],
    FORBID_ATTR: ['srcdoc', 'formaction'],
    ALLOW_DATA_ATTR: false,
};

export const sanitizeHtml = (html: string | null | undefined): string =>
    html ? DOMPurify.sanitize(html, MANUAL_HTML_CONFIG) : '';

/**
 * A whole printable page (with its own <style> block), e.g. the PDF export of a manual.
 * Same rules, but the page's <style> is kept.
 */
export const sanitizePrintableHtml = (html: string | null | undefined): string =>
    html ? DOMPurify.sanitize(html, { ...MANUAL_HTML_CONFIG, ADD_TAGS: ['style'], FORCE_BODY: true, WHOLE_DOCUMENT: false }) : '';

/** Text to show as text inside HTML (e.g. text taken out of a PDF): < > & " ' escaped. */
export const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * File types a browser may open in a tab of this app. Anything else (HTML, SVG, XML, unknown) is downloaded
 * instead: opened from a blob: address it would run as part of this site, with the user's login.
 */
const VIEWABLE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'text/plain'];

export const canOpenInBrowser = (mimeType: string | null | undefined): boolean =>
    !!mimeType && VIEWABLE_TYPES.includes(mimeType.split(';')[0].trim().toLowerCase());
