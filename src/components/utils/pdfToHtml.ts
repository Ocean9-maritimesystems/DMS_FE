/**
 * Turns the text of a PDF into simple HTML for the manual editor.
 *
 * A PDF stores positioned pieces of text, not paragraphs or headings, so the layout is rebuilt from what is there:
 *   - every page, in reading order; pieces on the same baseline become one line, with spaces where there are gaps;
 *   - lines close together become one paragraph; a larger gap, a new heading or a list item starts a new one;
 *   - text clearly larger than the body text becomes a heading (h2 / h3), a short line that is all bold a small heading;
 *   - bold and italic pieces stay bold / italic (from the font name, e.g. "Arial-BoldMT");
 *   - lines starting with a bullet (•, -, Word's Symbol bullets ...) or a number ("1.", "a)") become list items, and the
 *     lines that carry on under an item are added to it;
 *   - page numbers ("3", "Page 3 of 10") are left out, and so is rotated text (a diagonal "Downloaded Copy" or
 *     "CONFIDENTIAL" watermark);
 *   - with the PDF's drawing instructions (pass pdf.js' OPS): the text keeps its colour, and the pictures come in where
 *     they are on the page (as images inside the manual, not links).
 *   - tables: a PDF has no tables, only border lines and text at positions. The horizontal and vertical border lines
 *     are collected, a set of lines that meet becomes a grid (rows between the horizontal lines, columns between the
 *     vertical ones; a missing border joins two cells), and the text and pictures inside go into their cells.
 *     Tables drawn without border lines stay as text.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

interface Piece { text: string; x: number; y: number; w: number; size: number; bold: boolean; italic: boolean; color?: string }
interface Line { pieces: Piece[]; x: number; y: number; size: number; text: string; bold: boolean; right: number; image?: string }

/** The pdf.js operator numbers this needs (pdf.js' OPS object). */
export interface PdfOps { save: number; restore: number; transform: number; setFillRGBColor: number; showText: number;
    showSpacedText: number; nextLineShowText: number; nextLineSetSpacingShowText: number; paintImageXObject: number;
    paintInlineImageXObject: number; constructPath: number; stroke: number; closeStroke: number; fill: number;
    eoFill: number; fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number }

/** A border line: horizontal (y fixed, x1..x2) or vertical (x fixed, y1..y2), in page points. */
interface Seg { h: boolean; at: number; from: number; to: number }

const BULLET_RE = /^\s*([•●▪◦‣■□–\-*•]|o(?=\s))\s+/;
const NUMBER_RE = /^\s*((\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})[.)])\s+/;
const PAGE_NO_RE = /^\s*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*$/i;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bold / italic from the font's real name, once the page's fonts are loaded. */
const fontStyle = (page: { commonObjs: { has?: (id: string) => boolean; get: (id: string) => unknown } }, fontName: string) => {
    try {
        if (page.commonObjs.has && !page.commonObjs.has(fontName)) return { bold: false, italic: false };
        const f = page.commonObjs.get(fontName) as { name?: string; bold?: boolean; italic?: boolean; black?: boolean } | undefined;
        const name = (f?.name ?? '').toLowerCase();
        return {
            bold: !!f?.bold || !!f?.black || /bold|black|heavy|semibold|demi/.test(name),
            italic: !!f?.italic || /italic|oblique/.test(name),
        };
    } catch {
        return { bold: false, italic: false };
    }
};

const toLines = (pieces: Piece[]): Line[] => {
    const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Line[] = [];
    for (const p of sorted) {
        const line = lines.find((l) => Math.abs(l.y - p.y) < Math.max(l.size, p.size) * 0.45);
        if (line) { line.pieces.push(p); line.size = Math.max(line.size, p.size); }
        else lines.push({ pieces: [p], x: p.x, y: p.y, size: p.size, text: '', bold: false, right: 0 });
    }
    for (const l of lines) {
        l.pieces.sort((a, b) => a.x - b.x);
        l.x = l.pieces[0].x;
        let text = '';
        let end = -Infinity;
        for (const p of l.pieces) {
            if (text && !/\s$/.test(text) && !/^\s/.test(p.text) && p.x - end > p.size * 0.15) text += ' ';
            text += p.text;
            end = p.x + p.w;
        }
        l.text = text.replace(/\s+/g, ' ').trim();
        l.right = Math.max(...l.pieces.map((p) => p.x + p.w));
        const chars = l.pieces.reduce((n, p) => n + p.text.trim().length, 0);
        const boldChars = l.pieces.filter((p) => p.bold).reduce((n, p) => n + p.text.trim().length, 0);
        l.bold = chars > 0 && boldChars / chars > 0.8;
    }
    return lines.filter((l) => l.text).sort((a, b) => b.y - a.y);
};

/** A line as HTML, keeping bold / italic pieces (not when the whole line is bold: the block shows that). */
const lineHtml = (l: Line, skipChars = 0, wholeBold = false): string => {
    let html = '';
    let skip = skipChars;
    l.pieces.forEach((p, i) => {
        let t = p.text;
        if (skip > 0) { t = t.replace(/^\s+/, ''); const cut = Math.min(skip, t.length); t = t.slice(cut); skip -= cut; }
        if (!t) return;
        const prev = l.pieces[i - 1];
        const gap = prev ? p.x - (prev.x + prev.w) : 0;
        if (html && prev && gap > p.size * 2.5) html += ' &emsp;&emsp; '; // columns set apart with space, not a table
        else if (html && prev && !/\s$/.test(prev.text) && !/^\s/.test(t) && gap > p.size * 0.15) html += ' ';
        // Spaces stay outside <em>/<strong>, so "a <em>b</em> c" and not "a <em>b </em>c".
        const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(t) as RegExpExecArray;
        let h = escape(core);
        if (h && p.color) h = `<span style="color: ${p.color}">${h}</span>`;
        if (h && p.italic) h = `<em>${h}</em>`;
        if (h && p.bold && !wholeBold) h = `<strong>${h}</strong>`;
        html += lead + h + trail;
    });
    return html.replace(/\s+/g, ' ').replace(/<\/strong>(\s*)<strong>/g, '$1').replace(/<\/em>(\s*)<em>/g, '$1')
        .replace(/<\/span>(\s*)<span style="color: (#[0-9a-f]{6})">/g, (m, s, c, offset, all) => {
            // join two runs of the same colour: "<span color A>x</span> <span color A>y</span>"
            const before = all.lastIndexOf('<span style="color: ', offset);
            return before >= 0 && all.slice(before + 20, before + 27) === c ? s : m;
        }).trim();
};

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
/** pdf.js gives the fill colour as "#rrggbb" (newer) or [r, g, b] (older). Black and near-black count as "no colour". */
const colourOf = (arg: unknown): string | undefined => {
    let c: string | undefined;
    if (typeof arg === 'string' && /^#[0-9a-f]{6}$/i.test(arg)) c = arg.toLowerCase();
    else if (arg && typeof arg === 'object' && 'length' in (arg as ArrayLike<number>) && (arg as ArrayLike<number>).length >= 3) {
        const a = arg as ArrayLike<number>;
        c = `#${hex(a[0])}${hex(a[1])}${hex(a[2])}`;
    }
    if (!c) return undefined;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c!.slice(i, i + 2), 16));
    return r < 60 && g < 60 && b < 60 ? undefined : c;
};

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

interface PageImage { x: number; top: number; width: number; height: number; data: unknown }

/** A pdf.js image (an ImageBitmap, or pixel data) as a data: URL, through a canvas. */
const imageUrl = (img: { width?: number; height?: number; bitmap?: CanvasImageSource; data?: Uint8Array | Uint8ClampedArray; kind?: number } | null): string | null => {
    if (!img || typeof document === 'undefined' || !img.width || !img.height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let alpha = false;
    if (img.bitmap) {
        ctx.drawImage(img.bitmap, 0, 0);
        alpha = true;
    } else if (img.data) {
        const out = ctx.createImageData(img.width, img.height);
        const d = img.data;
        const px = img.width * img.height;
        if (img.kind === 3) { out.data.set(d.subarray(0, px * 4)); alpha = true; }          // RGBA
        else if (img.kind === 2) { for (let i = 0; i < px; i++) { out.data[i * 4] = d[i * 3]; out.data[i * 4 + 1] = d[i * 3 + 1]; out.data[i * 4 + 2] = d[i * 3 + 2]; out.data[i * 4 + 3] = 255; } } // RGB
        else if (img.kind === 1) {                                                           // 1 bit per pixel
            const rowBytes = Math.ceil(img.width / 8);
            for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
                const on = (d[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
                const i = (y * img.width + x) * 4;
                out.data[i] = out.data[i + 1] = out.data[i + 2] = on ? 255 : 0; out.data[i + 3] = 255;
            }
        } else return null;
        ctx.putImageData(out, 0, 0);
    } else return null;
    try { return canvas.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.85); } catch { return null; }
};

/** Waits (up to 3 s) for an image the page has decoded. */
const pageObject = (page: PDFPageProxy, id: string): Promise<unknown> => new Promise((resolve) => {
    const store = (id.startsWith('g_') ? page.commonObjs : page.objs) as unknown as { has: (i: string) => boolean; get: (i: string, cb?: (v: unknown) => void) => unknown };
    const timer = setTimeout(() => resolve(null), 3000);
    try {
        if (store.has(id)) { clearTimeout(timer); resolve(store.get(id)); }
        else store.get(id, (v) => { clearTimeout(timer); resolve(v); });
    } catch { clearTimeout(timer); resolve(null); }
});

/**
 * Walks the page's drawing instructions: the fill colour of every character drawn (in drawing order), and where each
 * picture is drawn (its box from the transformation matrix in force).
 */
const scanPage = async (page: PDFPageProxy, ops: PdfOps) => {
    const list = await page.getOperatorList();
    const chars: { ch: string; color?: string }[] = [];
    const images: PageImage[] = [];
    const segs: Seg[] = [];
    const point = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const painted = new Set([ops.stroke, ops.closeStroke, ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
    const strokes = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
    /** Border lines from one drawn path: straight horizontal / vertical strokes, and thin filled bars (how Chrome draws borders). */
    const addPath = (paint: number, path: ArrayLike<number>, m: Matrix) => {
        const pts: [number, number][][] = [];
        let cur: [number, number][] = [];
        for (let i = 0; i < path.length;) {
            const op = path[i++];
            if (op === 0) { if (cur.length) pts.push(cur); cur = [point(m, path[i++], path[i++])]; }
            else if (op === 1) cur.push(point(m, path[i++], path[i++]));
            else if (op === 2) { i += 6; cur = []; }            // curves: not a border
            else if (op === 3) { if (cur.length) cur.push(cur[0]); }
            else break;
        }
        if (cur.length) pts.push(cur);
        for (const sub of pts) {
            if (sub.length < 2) continue;
            const xs = sub.map((p) => p[0]); const ys = sub.map((p) => p[1]);
            const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            if (!strokes.has(paint)) {
                // A filled shape counts only as a thin bar (a border drawn as a rectangle).
                if (y2 - y1 <= 3 && x2 - x1 > 6) segs.push({ h: true, at: (y1 + y2) / 2, from: x1, to: x2 });
                else if (x2 - x1 <= 3 && y2 - y1 > 6) segs.push({ h: false, at: (x1 + x2) / 2, from: y1, to: y2 });
                continue;
            }
            for (let k = 1; k < sub.length; k++) {
                const [ax, ay] = sub[k - 1]; const [bx, by] = sub[k];
                if (Math.abs(ay - by) < 0.5 && Math.abs(ax - bx) > 6) segs.push({ h: true, at: ay, from: Math.min(ax, bx), to: Math.max(ax, bx) });
                else if (Math.abs(ax - bx) < 0.5 && Math.abs(ay - by) > 6) segs.push({ h: false, at: ax, from: Math.min(ay, by), to: Math.max(ay, by) });
            }
        }
    };
    let state = { ctm: [1, 0, 0, 1, 0, 0] as Matrix, color: undefined as string | undefined };
    const stack: typeof state[] = [];
    const addGlyphs = (glyphs: unknown) => {
        if (!Array.isArray(glyphs)) return;
        for (const g of glyphs) {
            const u = g && typeof g === 'object' ? (g as { unicode?: string }).unicode : undefined;
            if (u) for (const ch of u) if (!/\s/.test(ch)) chars.push({ ch, color: state.color });
        }
    };
    for (let i = 0; i < list.fnArray.length; i++) {
        const fn = list.fnArray[i];
        const args = list.argsArray[i] as unknown[];
        if (fn === ops.save) stack.push({ ...state });
        else if (fn === ops.restore) state = stack.pop() ?? state;
        else if (fn === ops.transform) state = { ...state, ctm: multiply(state.ctm, args as unknown as Matrix) };
        else if (fn === ops.setFillRGBColor) state = { ...state, color: colourOf(args.length === 1 ? args[0] : args) };
        else if (fn === ops.showText || fn === ops.showSpacedText || fn === ops.nextLineShowText) addGlyphs(args[0]);
        else if (fn === ops.nextLineSetSpacingShowText) addGlyphs(args[2]);
        else if (fn === ops.constructPath) {
            const [paint, data] = args as [number, unknown];
            const path = Array.isArray(data) ? data[0] : null;
            if (painted.has(paint) && path && typeof (path as ArrayLike<number>).length === 'number') addPath(paint, path as ArrayLike<number>, state.ctm);
        }
        else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
            const [a, b, c, d, e, f] = state.ctm;
            const width = Math.hypot(a, b);
            const height = Math.hypot(c, d);
            if (width < 12 || height < 12) continue; // dots, rules and other tiny marks
            const data = fn === ops.paintImageXObject ? await pageObject(page, String(args[0])) : args[0];
            images.push({ x: Math.min(e, e + c), top: Math.max(f, f + d), width, height, data });
        }
    }
    return { chars, images, segs };
};

interface Table { x1: number; x2: number; y1: number; y2: number; cols: number[]; rows: number[]; segs: Seg[] }

/** Groups border lines that meet into tables (at least 2 horizontal and 2 vertical lines), with their row / column edges. */
const findTables = (segs: Seg[]): Table[] => {
    const tol = 2;
    const touches = (a: Seg, b: Seg) => {
        if (a.h === b.h) return Math.abs(a.at - b.at) <= tol && a.from <= b.to + tol && b.from <= a.to + tol;
        const [h, v] = a.h ? [a, b] : [b, a];
        return v.at >= h.from - tol && v.at <= h.to + tol && h.at >= v.from - tol && h.at <= v.to + tol;
    };
    const parent = segs.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (touches(segs[i], segs[j])) parent[root(i)] = root(j);
    const groups = new Map<number, Seg[]>();
    segs.forEach((s, i) => { const r = root(i); groups.set(r, [...(groups.get(r) ?? []), s]); });
    const edges = (values: number[]) => values.sort((a, b) => a - b).reduce<number[]>((acc, v) => {
        if (!acc.length || v - acc[acc.length - 1] > tol) acc.push(v);
        return acc;
    }, []);
    const tables: Table[] = [];
    for (const g of groups.values()) {
        const hs = g.filter((s) => s.h); const vs = g.filter((s) => !s.h);
        if (hs.length < 2 || vs.length < 2) continue;
        const cols = edges(vs.map((s) => s.at));
        const rows = edges(hs.map((s) => s.at)).reverse(); // top first (PDF y goes up)
        if (cols.length < 2 || rows.length < 2) continue;
        tables.push({ x1: cols[0], x2: cols[cols.length - 1], y1: rows[rows.length - 1], y2: rows[0], cols, rows, segs: g });
    }
    return tables;
};

/** A table as HTML: its cells (joined where a border is missing) with the text and pictures that lie inside them. */
const tableHtml = (t: Table, pieces: Piece[], images: { x: number; top: number; html: string }[], body: number): string => {
    const nr = t.rows.length - 1; const nc = t.cols.length - 1;
    const tol = 2;
    const hasV = (x: number, yTop: number, yBottom: number) => t.segs.some((s) => !s.h && Math.abs(s.at - x) <= tol && s.from <= yBottom + tol + (yTop - yBottom) * 0.5 && s.to >= yTop - tol - (yTop - yBottom) * 0.5);
    const hasH = (y: number, xL: number, xR: number) => t.segs.some((s) => s.h && Math.abs(s.at - y) <= tol && s.from <= xL + (xR - xL) * 0.5 && s.to >= xR - (xR - xL) * 0.5);
    // Cells joined where the border between them is missing.
    const id = (r: number, c: number) => r * nc + c;
    const parent = Array.from({ length: nr * nc }, (_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
        if (c + 1 < nc && !hasV(t.cols[c + 1], t.rows[r], t.rows[r + 1])) parent[root(id(r, c))] = root(id(r, c + 1));
        if (r + 1 < nr && !hasH(t.rows[r + 1], t.cols[c], t.cols[c + 1])) parent[root(id(r, c))] = root(id(r + 1, c));
    }
    const cellOf = (x: number, y: number) => {
        const c = t.cols.findIndex((v, i) => i < nc && x >= v - tol && x <= t.cols[i + 1] + tol);
        const r = t.rows.findIndex((v, i) => i < nr && y <= v + tol && y >= t.rows[i + 1] - tol);
        return c < 0 || r < 0 ? -1 : root(id(r, c));
    };
    const content = new Map<number, { pieces: Piece[]; images: { top: number; html: string }[] }>();
    const slot = (k: number) => { if (!content.has(k)) content.set(k, { pieces: [], images: [] }); return content.get(k)!; };
    for (const p of pieces) { const k = cellOf(p.x + Math.min(p.w, 4) / 2, p.y + p.size * 0.3); if (k >= 0) slot(k).pieces.push(p); }
    for (const im of images) { const k = cellOf(im.x + 2, im.top - 2); if (k >= 0) slot(k).images.push(im); }

    const cellHtml = (k: number) => {
        const c = content.get(k);
        if (!c) return '';
        const blocks: { y: number; html: string }[] = c.images.map((im) => ({ y: im.top, html: im.html }));
        let prevLine: Line | null = null;
        for (const l of toLines(c.pieces)) {
            let h = lineHtml(l);
            if (l.size / body >= 1.15 && !/<strong>/.test(h)) h = `<strong>${h}</strong>`;
            const join = prevLine && prevLine.y - l.y <= Math.max(prevLine.size, l.size) * 1.7;
            blocks.push({ y: l.y, html: (prevLine ? (join ? ' ' : '<br>') : '') + h });
            prevLine = l;
        }
        return blocks.sort((a, b) => b.y - a.y).map((b) => b.html).join('').replace(/^<br>/, '');
    };

    const done = new Set<number>();
    const rowsHtml: string[] = [];
    for (let r = 0; r < nr; r++) {
        const cells: string[] = [];
        for (let c = 0; c < nc; c++) {
            const k = root(id(r, c));
            if (done.has(k)) continue;
            done.add(k);
            let r2 = r; let c2 = c;
            while (r2 + 1 < nr && root(id(r2 + 1, c)) === k) r2++;
            while (c2 + 1 < nc && root(id(r, c2 + 1)) === k) c2++;
            const span = `${r2 > r ? ` rowspan="${r2 - r + 1}"` : ''}${c2 > c ? ` colspan="${c2 - c + 1}"` : ''}`;
            const width = Math.round(((t.cols[c2 + 1] - t.cols[c]) / (t.x2 - t.x1)) * 100);
            cells.push(`<td${span} style="width: ${width}%; border: 1px solid #555; padding: 4px 6px; vertical-align: middle;">${cellHtml(k) || '&nbsp;'}</td>`);
        }
        if (cells.length) rowsHtml.push(`<tr>${cells.join('')}</tr>`);
    }
    return `<table style="width: 100%; border-collapse: collapse;"><tbody>${rowsHtml.join('')}</tbody></table>`;
};

/** Gives each text piece the colour its first character was drawn in (matching the drawn characters in order). */
const colourPieces = (pieces: Piece[], chars: { ch: string; color?: string }[]) => {
    let at = 0;
    for (const p of pieces) {
        const own = [...p.text].filter((ch) => !/\s/.test(ch));
        if (!own.length) continue;
        // The piece's first characters (up to 6) must all match in a row, so "F" of "Fleet" is not taken for the "F" of a
        // watermark drawn just before it.
        const m = Math.min(own.length, 6);
        const matchesAt = (k: number) => { for (let j = 0; j < m; j++) if (chars[k + j]?.ch !== own[j]) return false; return true; };
        let k = at;
        const limit = Math.min(chars.length, at + 2000);
        while (k < limit && !matchesAt(k)) k++;
        if (k >= limit) continue;            // not found nearby: leave it without a colour
        p.color = chars[k].color;
        at = Math.min(chars.length, k + own.length);
    }
};

/**
 * ops: pdf.js' OPS (import { OPS } from 'pdfjs-dist'). With it, colours and pictures are taken over too; without it,
 * only the text and its layout.
 */
export async function pdfToHtml(pdf: PDFDocumentProxy, ops?: PdfOps): Promise<string> {
    const lines: Line[] = [];
    const pictures: Line[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        let scan: Awaited<ReturnType<typeof scanPage>> | null = null;
        try {
            if (ops) scan = await scanPage(page, ops);
            else await page.getOperatorList(); // loads the fonts, for bold / italic
        } catch { /* no colours, pictures, bold or italic for this page */ }
        const pieces: Piece[] = [];
        for (const item of content.items) {
            if (!('str' in item) || !item.str) continue;
            const [a, b, , , x, y] = item.transform as number[];
            const style = fontStyle(page as unknown as Parameters<typeof fontStyle>[0], item.fontName);
            const rotated = Math.abs(b) > Math.abs(a) * 0.1;
            pieces.push({ text: item.str, x, y, w: item.width, size: Math.hypot(a, b) || item.height || 10, ...style, ...(rotated ? { rotated: true } : {}) } as Piece);
        }
        if (scan) colourPieces(pieces, scan.chars);
        // Rotated text (a diagonal watermark) is left out; it was only needed above to keep the colours in step.
        let upright = pieces.filter((p) => !(p as Piece & { rotated?: boolean }).rotated);
        // Pages one after the other: later pages below the earlier ones.
        const offset = n * 100000;
        let pageImages = (scan?.images ?? []).map((img) => {
            const url = imageUrl(img.data as Parameters<typeof imageUrl>[0]);
            const w = Math.round(img.width * (96 / 72)); // PDF points to screen pixels
            return url ? { x: img.x, top: img.top, right: img.x + img.width, html: `<img src="${url}" alt="" width="${w}" style="max-width: 100%; height: auto;">` } : null;
        }).filter((i): i is NonNullable<typeof i> => !!i);

        // Tables: their text and pictures go into the cells, the table into the flow at its top edge.
        for (const tbl of findTables(scan?.segs ?? [])) {
            const inside = (x: number, y: number) => x >= tbl.x1 - 2 && x <= tbl.x2 + 2 && y >= tbl.y1 - 2 && y <= tbl.y2 + 2;
            const tPieces = upright.filter((p) => inside(p.x + Math.min(p.w, 4) / 2, p.y + p.size * 0.3));
            const tImages = pageImages.filter((im) => inside(im.x + 2, im.top - 2));
            if (!tPieces.length && !tImages.length) continue;
            const bodySize = tPieces.length ? [...tPieces].sort((a, b) => a.size - b.size)[Math.floor(tPieces.length / 2)].size : 10;
            pictures.push({ pieces: [], x: tbl.x1, y: tbl.y2 - offset, size: 0, text: '', bold: false, right: tbl.x2,
                image: tableHtml(tbl, tPieces, tImages, bodySize) });
            upright = upright.filter((p) => !tPieces.includes(p));
            pageImages = pageImages.filter((im) => !tImages.includes(im));
        }

        const pageLines = toLines(upright).filter((l) => !PAGE_NO_RE.test(l.text));
        pageLines.forEach((l) => { l.y -= offset; });
        lines.push(...pageLines);
        for (const im of pageImages) {
            pictures.push({ pieces: [], x: im.x, y: im.top - offset, size: 0, text: '', bold: false, right: im.right, image: `<p>${im.html}</p>` });
        }
        page.cleanup();
    }
    if (!lines.length && !pictures.length) return '';
    if (!lines.length) return pictures.map((p) => p.image).join('\n');

    // Body text size: the size most of the characters have.
    const bySize = new Map<number, number>();
    lines.forEach((l) => bySize.set(Math.round(l.size), (bySize.get(Math.round(l.size)) ?? 0) + l.text.length));
    const body = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0] || 10;

    // The left margin (where most lines start) and the right edge of full lines: an indented line is a list item
    // whose bullet was drawn as a shape (no character), and a line ending well short of the edge ends an item.
    const byX = new Map<number, number>();
    lines.forEach((l) => byX.set(Math.round(l.x), (byX.get(Math.round(l.x)) ?? 0) + l.text.length));
    const margin = [...byX.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const fullRight = Math.max(...lines.map((l) => l.right));
    const indented = (l: Line) => l.x > margin + body * 0.8;

    const out: string[] = [];
    let para: string[] = [];
    let list: { tag: 'ul' | 'ol'; items: string[]; x: number } | null = null;
    let prev: Line | null = null;

    const flushPara = () => { if (para.length) out.push(`<p>${para.join(' ')}</p>`); para = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`); list = null; };

    // Pictures go in between the lines, by their top edge.
    const all = [...lines, ...pictures].sort((a, b) => b.y - a.y);
    for (const l of all) {
        if (l.image) {
            flushPara(); flushList();
            out.push(l.image);
            prev = null;
            continue;
        }
        const gap = prev ? prev.y - l.y : 0;
        const newBlock = !prev || gap > Math.max(prev.size, l.size) * 1.7 || Math.abs(prev.y - l.y) > 50000;
        const ratio = l.size / body;
        const bullet = BULLET_RE.exec(l.text);
        const numbered = bullet ? null : NUMBER_RE.exec(l.text);

        if (ratio >= 1.15 && l.text.length < 160) {
            flushPara(); flushList();
            const tag = ratio >= 1.5 ? 'h2' : 'h3';
            const last = out[out.length - 1];
            // A heading wrapped over two lines stays one heading.
            if (prev && !newBlock && last?.startsWith(`<${tag}>`)) out[out.length - 1] = last.replace(`</${tag}>`, ` ${lineHtml(l, 0, true)}</${tag}>`);
            else out.push(`<${tag}>${lineHtml(l, 0, true)}</${tag}>`);
        } else if (bullet || numbered) {
            flushPara();
            const tag = bullet ? 'ul' : 'ol';
            if (!list || list.tag !== tag) { flushList(); list = { tag, items: [], x: l.x }; }
            const marker = (bullet ?? numbered)![0];
            // Skip the bullet character itself: count the characters of the marker (without the spaces after it).
            list.items.push(lineHtml(l, marker.trim().length));
        } else if (list && !newBlock && l.x > list.x + body * 0.5) {
            list.items[list.items.length - 1] += ` ${lineHtml(l)}`; // a list item that carries on on the next line
        } else if (indented(l) && prev && !/^\s*$/.test(l.text)) {
            // Indented without a bullet character: a list item, or the next line of the item above.
            flushPara();
            const carriesOn = list && list.tag === 'ul' && !newBlock && indented(prev) && Math.abs(prev.x - l.x) < body * 0.5
                && !/[.;:!?]$/.test(prev.text) && prev.right > fullRight - body * 4;
            if (carriesOn && list) list.items[list.items.length - 1] += ` ${lineHtml(l)}`;
            else {
                if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [], x: l.x }; }
                list.items.push(lineHtml(l));
            }
        } else if (l.bold && l.text.length < 100 && !/[.:;,]$/.test(l.text) && (newBlock || !para.length)) {
            flushPara(); flushList();
            out.push(`<h4>${lineHtml(l, 0, true)}</h4>`);
        } else {
            flushList();
            if (newBlock) flushPara();
            para.push(lineHtml(l));
        }
        prev = l;
    }
    flushPara(); flushList();
    return out.join('\n');
}
