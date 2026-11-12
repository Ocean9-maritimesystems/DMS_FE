import { ReportColumn } from './reportCatalog';
import { COMPANY_NAME } from '../../config/appConfig';

/**
 * Report exports, made in the browser from the rows on screen (after the table's search and sort):
 *   Excel  exceljs          real dates and numbers, bold frozen header, filter buttons, sized columns
 *   PDF    jspdf-autotable  title, filters, generated date, repeated header, page numbers
 *   CSV    plain text       UTF-8 with BOM so Excel opens accents correctly
 * exceljs and jspdf are loaded only when an export is made, so they do not slow down the page.
 */

export type Row = Record<string, unknown>;

export interface ExportInfo {
    title: string;
    /** "Vessel: X · Issued: 1 Oct 2026 – 22 Oct 2026" */
    filters: string;
    columns: ReportColumn[];
    rows: Row[];
    landscape?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const toDate = (value: unknown): Date | null => {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
};

/** 22 Oct 2026 / 22 Oct 2026 14:05 - the same in the table, the PDF and the CSV. */
export const formatCell = (column: ReportColumn, value: unknown): string => {
    if (value == null || value === '') return '';
    if (column.type === 'date' || column.type === 'datetime') {
        const d = toDate(value);
        if (!d) return String(value);
        const day = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        return column.type === 'datetime' ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
    }
    if (column.type === 'number') {
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString() : String(value);
    }
    return String(value);
};

/** "Pending acknowledgements 2026-10-22.xlsx" without characters Windows does not allow. */
export const fileName = (title: string, ext: string) => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()} ${stamp}.${ext}`;
};

const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const generatedText = () => `Generated ${formatCell({ field: '', header: '', type: 'datetime' }, new Date())}`;

// ------------------------------------------------------------------------------------------------ CSV

export const exportCsv = ({ title, columns, rows }: ExportInfo) => {
    const quote = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    const lines = [
        columns.map((c) => quote(c.header)).join(','),
        ...rows.map((r) => columns.map((c) => {
            const v = r[c.field];
            // Numbers stay plain (no thousands separator) so Excel reads them as numbers.
            if (c.type === 'number' && v != null && v !== '') return String(v);
            return quote(formatCell(c, v));
        }).join(',')),
    ];
    save(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName(title, 'csv'));
};

// ------------------------------------------------------------------------------------------------ Excel

export const exportExcel = async ({ title, filters, columns, rows }: ExportInfo) => {
    // exceljs comes as a CommonJS module: its exports are on .default in some bundles, at the top in others.
    type ExcelModule = typeof import('exceljs');
    const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule };
    const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook();
    wb.creator = COMPANY_NAME || 'DMS';
    wb.created = new Date();
    const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), {
        views: [{ state: 'frozen', ySplit: 4 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([[filters, generatedText()].filter(Boolean).join('   ·   ')]).font = { italic: true, color: { argb: 'FF6B7280' } };
    ws.addRow([]);

    const header = ws.addRow(columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 22;
    header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0072BC' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF005A94' } } };
    });

    rows.forEach((r) => {
        const row = ws.addRow(columns.map((c) => {
            const v = r[c.field];
            if (v == null || v === '') return null;
            if (c.type === 'date' || c.type === 'datetime') {
                const d = toDate(v);
                // Excel has no time zones: write the local wall-clock time shown in the app.
                return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())) : String(v);
            }
            if (c.type === 'number') {
                const n = Number(v);
                return Number.isFinite(n) ? n : String(v);
            }
            return String(v);
        }));
        row.alignment = { vertical: 'top', wrapText: true };
    });

    columns.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        if (c.type === 'date') col.numFmt = 'dd mmm yyyy';
        if (c.type === 'datetime') col.numFmt = 'dd mmm yyyy hh:mm';
        if (c.type === 'number') col.alignment = { horizontal: 'right', vertical: 'top' };
        // Width from the longest value (capped), so long titles wrap instead of making huge columns.
        const longest = Math.max(c.header.length, ...rows.slice(0, 500).map((r) => formatCell(c, r[c.field]).length));
        col.width = Math.min(Math.max(longest + 2, c.type === 'datetime' ? 18 : 10), (c.weight ?? 1) >= 2 ? 60 : 36);
    });

    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };

    const buffer = await wb.xlsx.writeBuffer();
    save(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(title, 'xlsx'));
};

// ------------------------------------------------------------------------------------------------ PDF

export const exportPdf = async ({ title, filters, columns, rows, landscape }: ExportInfo) => {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    type AutoTable = typeof import('jspdf-autotable').default;
    const tables = autoTableModule as unknown as { autoTable?: AutoTable; default?: AutoTable };
    const autoTable = (tables.autoTable ?? tables.default) as AutoTable;

    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 32;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(17, 24, 39);
    doc.text(title, margin, margin + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    const sub = [COMPANY_NAME, filters, generatedText(), `${rows.length} row${rows.length === 1 ? '' : 's'}`].filter(Boolean).join('   ·   ');
    doc.text(doc.splitTextToSize(sub, pageWidth - margin * 2), margin, margin + 22);

    // Widths by weight, but never narrower than the longest word of the header (so it does not break mid-word).
    const fontSize = columns.length > 10 ? 7 : 8;
    const usable = pageWidth - margin * 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    const minWidth = columns.map((c) => Math.max(...c.header.split(/\s+/).map((w) => doc.getTextWidth(w))) + 10);
    const widths = columns.map((c) => c.weight ?? 1);
    let fixed = new Set<number>();
    for (let pass = 0; pass < columns.length; pass += 1) {
        const free = usable - [...fixed].reduce((s, i) => s + minWidth[i], 0);
        const weight = widths.reduce((s, w, i) => (fixed.has(i) ? s : s + w), 0);
        const tooNarrow = widths.findIndex((w, i) => !fixed.has(i) && (free * w) / weight < minWidth[i]);
        if (tooNarrow < 0) break;
        fixed = new Set([...fixed, tooNarrow]);
    }
    const free = usable - [...fixed].reduce((s, i) => s + minWidth[i], 0);
    const freeWeight = widths.reduce((s, w, i) => (fixed.has(i) ? s : s + w), 0);
    const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'right' }> = {};
    columns.forEach((c, i) => {
        columnStyles[i] = {
            cellWidth: fixed.has(i) ? minWidth[i] : (free * widths[i]) / freeWeight,
            halign: c.type === 'number' ? 'right' : 'left',
        };
    });
    doc.setFont('helvetica', 'normal');

    autoTable(doc, {
        startY: margin + 40,
        margin: { left: margin, right: margin, top: margin, bottom: margin + 10 },
        head: [columns.map((c) => c.header)],
        body: rows.map((r) => columns.map((c) => formatCell(c, r[c.field]))),
        styles: { font: 'helvetica', fontSize, cellPadding: 4, overflow: 'linebreak', lineColor: [229, 231, 235], lineWidth: 0.5 },
        headStyles: { fillColor: [0, 114, 188], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles,
        didDrawPage: () => {
            const page = doc.getNumberOfPages();
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175);
            doc.text(title, margin, pageHeight - 16);
            doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
        },
    });

    doc.save(fileName(title, 'pdf'));
};
