import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import featureApi, { VesselOption } from '../../services/featureApi';
import notify from '../../services/notify';
import { ContextReport, Option, REPORT_CONTEXTS, ReportColumn, ReportContextKey, ReportDefinition, reportByKey } from './reportCatalog';
import { exportCsv, exportExcel, exportPdf, formatCell, Row, toDate } from './reportExport';
import './ReportsPage.scss';

interface Filters {
    vesselId: number | null;
    itemType: string | null;
    status: string | null;
    from: Date | null;
    to: Date | null;
    overdueOnly: boolean;
    days: number | null;
    topLevelOnly: boolean;
}

const EMPTY: Filters = { vesselId: null, itemType: null, status: null, from: null, to: null, overdueOnly: false, days: null, topLevelOnly: false };

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Colour of a tag value (status, type, overdue...). */
const tagClass = (value: string) => {
    const v = value.toLowerCase();
    if (['yes', 'expired', 'failed', 'cancelled', 'rejected', 'never synced'].includes(v)) return 'bad';
    if (['expiring', 'needsinfo', 'draft'].includes(v)) return 'warn';
    if (['valid', 'ok', 'active', 'accepted', 'implemented', 'published', 'from vessel'].includes(v)) return 'ok';
    if (['no', 'no expiry', 'closed', 'office only'].includes(v)) return 'muted';
    return 'info';
};

interface ReportViewProps {
    report: ReportDefinition;
    vessels: VesselOption[];
    docTypes: Option[];
    /** How the area that opened the report uses it: preset filters, narrower item types, a row filter, its own title. */
    use?: ContextReport;
}

/** One report: its filters, results and exports. Mounted again (fresh filters) when another report is picked. */
export const ReportView: React.FC<ReportViewProps> = ({ report, vessels, docTypes, use }) => {
    const initial = useMemo<Filters>(() => ({ ...EMPTY, ...report.defaults, ...use?.preset }), [report, use]);
    const [filters, setFilters] = useState<Filters>(initial);
    const title = use?.title ?? report.title;
    const [rows, setRows] = useState<Row[]>([]);
    const [shown, setShown] = useState<Row[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState<string | null>(null);
    /** Only the newest request may fill the table (an older, slower one is ignored). */
    const requestNo = useRef(0);

    const run = useCallback(async () => {
        const q = new URLSearchParams();
        if (report.filters.includes('vessel') && filters.vesselId != null) q.set('vesselId', String(filters.vesselId));
        if (report.filters.includes('itemType') && filters.itemType) q.set('itemType', filters.itemType);
        if (report.filters.includes('status') && filters.status) q.set('status', filters.status);
        if (report.filters.includes('dateRange') && filters.from) q.set('from', isoDate(filters.from));
        if (report.filters.includes('dateRange') && filters.to) q.set('to', isoDate(filters.to));
        if (report.filters.includes('overdueOnly') && filters.overdueOnly) q.set('overdueOnly', 'true');
        if (report.filters.includes('days') && filters.days != null) q.set('days', String(filters.days));
        if (report.filters.includes('topLevelOnly') && filters.topLevelOnly) q.set('topLevelOnly', 'true');
        const query = q.toString();

        const mine = ++requestNo.current;
        setLoading(true);
        setError(null);
        try {
            const data = await dmsLifecycleService.getApiCall<Row[]>(`Reports/${report.key}${query ? `?${query}` : ''}`);
            if (mine !== requestNo.current) return;
            const all = Array.isArray(data) ? data : [];
            const only = use?.rowFilter;
            setRows(only ? all.filter((r) => only.values.includes(String(r[only.field] ?? ''))) : all);
            setShown(null);
        } catch (err) {
            if (mine !== requestNo.current) return;
            setRows([]);
            setError(errorMessage(err, 'The report could not be run.'));
        } finally {
            if (mine === requestNo.current) setLoading(false);
        }
    }, [report, filters, use]);

    // Runs when the report or its filters change (short pause while typing a number).
    useEffect(() => {
        const t = window.setTimeout(run, 250);
        return () => window.clearTimeout(t);
    }, [run]);

    const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

    const vesselOptions = useMemo(() => [
        { label: 'All vessels', value: null as number | null },
        ...(report.vesselWithOffice ? [{ label: 'Office', value: -1 as number | null }] : []),
        ...vessels.map((v) => ({ label: v.vslName, value: v.vesselID as number | null })),
    ], [vessels, report.vesselWithOffice]);

    // Kept as one array between renders, so the export text below is not rebuilt on every render.
    const useItemTypes = use?.itemTypes;
    const itemTypeOptions = useMemo(
        () => useItemTypes ?? (report.itemTypes === 'documentTypes' ? docTypes : report.itemTypes ?? []),
        [useItemTypes, report.itemTypes, docTypes]);
    /** One item type only (e.g. manuals): it is applied, not offered. */
    const showItemType = report.filters.includes('itemType') && itemTypeOptions.length !== 1;

    /** "Vessel: X · Status: Y · Issued: 1 Oct 2026 – 22 Oct 2026", for the exports. */
    const filterText = useMemo(() => {
        const parts: string[] = [];
        const label = (options: { label: string; value: unknown }[], value: unknown) => options.find((o) => o.value === value)?.label ?? String(value);
        if (report.filters.includes('vessel') && filters.vesselId != null) parts.push(`Vessel: ${label(vesselOptions, filters.vesselId)}`);
        if (showItemType && filters.itemType) parts.push(`${report.itemTypeLabel ?? 'Type'}: ${label(itemTypeOptions, filters.itemType)}`);
        if (report.filters.includes('status') && filters.status) parts.push(`${report.statusLabel ?? 'Status'}: ${report.statuses ? label(report.statuses, filters.status) : filters.status}`);
        if (report.filters.includes('dateRange') && (filters.from || filters.to)) {
            const d = (x: Date | null) => (x ? formatCell({ field: '', header: '', type: 'date' }, x) : '…');
            parts.push(`${report.dateLabel ?? 'Date'}: ${d(filters.from)} – ${d(filters.to)}`);
        }
        if (report.filters.includes('days') && filters.days != null) parts.push(`${report.daysLabel ?? 'Days'}: ${filters.days}`);
        if (report.filters.includes('overdueOnly') && filters.overdueOnly) parts.push('Overdue only');
        if (report.filters.includes('topLevelOnly') && filters.topLevelOnly) parts.push('Top-level manuals only');
        if (search.trim()) parts.push(`Search: "${search.trim()}"`);
        return parts.join(' · ');
    }, [report, filters, vesselOptions, itemTypeOptions, showItemType, search]);

    const visible = shown ?? rows;

    const doExport = async (kind: 'xlsx' | 'pdf' | 'csv') => {
        if (visible.length === 0) { notify.warn('There are no rows to export.'); return; }
        const info = { title, filters: filterText, columns: report.columns, rows: visible, landscape: report.landscape };
        setExporting(kind);
        try {
            if (kind === 'xlsx') await exportExcel(info);
            else if (kind === 'pdf') await exportPdf(info);
            else exportCsv(info);
        } catch (err) {
            notify.error(errorMessage(err, 'The export could not be made.'), 'Export failed');
        } finally {
            setExporting(null);
        }
    };

    const cell = (column: ReportColumn) => (row: Row) => {
        const text = formatCell(column, row[column.field]);
        if (!text) return <span className="rp-empty-cell">—</span>;
        if (column.type === 'tag') return <span className={`feature-tag ${tagClass(text)}`}>{text}</span>;
        if (column.type === 'number') return <span className="rp-num">{text}</span>;
        return text;
    };

    /** Sort dates as dates (the API sends text). */
    const sortField = (column: ReportColumn) => (column.type === 'date' || column.type === 'datetime' ? `__sort_${column.field}` : column.field);
    const tableRows = useMemo(() => rows.map((r) => {
        const out: Row = { ...r };
        report.columns.forEach((c) => {
            if (c.type === 'date' || c.type === 'datetime') out[`__sort_${c.field}`] = toDate(r[c.field])?.getTime() ?? null;
        });
        return out;
    }), [rows, report.columns]);

    return (
                <section className="rp-report">
                    <header className="rp-head">
                        <span className="rp-head-icon"><i className={report.icon} aria-hidden="true" /></span>
                        <div className="rp-head-text">
                            <span className="rp-head-group">{report.group}</span>
                            <h2>{title}</h2>
                            <p>{report.description}</p>
                        </div>
                        <div className="rp-export" role="group" aria-label="Export">
                            <Button type="button" label="Excel" icon="pi pi-file-excel" outlined loading={exporting === 'xlsx'}
                                disabled={loading || !!exporting || visible.length === 0} onClick={() => doExport('xlsx')} />
                            <Button type="button" label="PDF" icon="pi pi-file-pdf" outlined loading={exporting === 'pdf'}
                                disabled={loading || !!exporting || visible.length === 0} onClick={() => doExport('pdf')} />
                            <Button type="button" label="CSV" icon="pi pi-file" outlined loading={exporting === 'csv'}
                                disabled={loading || !!exporting || visible.length === 0} onClick={() => doExport('csv')} />
                        </div>
                    </header>

                    <div className="rp-filters">
                        {report.filters.includes('vessel') && (
                            <label className="rp-field">
                                <span>Vessel</span>
                                <Dropdown value={filters.vesselId} options={vesselOptions} onChange={(e) => set('vesselId', e.value ?? null)} filter placeholder="All vessels" />
                            </label>
                        )}
                        {showItemType && (
                            <label className="rp-field">
                                <span>{report.itemTypeLabel ?? 'Type'}</span>
                                <Dropdown value={filters.itemType} options={itemTypeOptions} onChange={(e) => set('itemType', e.value ?? null)}
                                    showClear placeholder="All" filter={itemTypeOptions.length > 8} />
                            </label>
                        )}
                        {report.filters.includes('status') && (
                            report.statuses ? (
                                <label className="rp-field">
                                    <span>{report.statusLabel ?? 'Status'}</span>
                                    <Dropdown value={filters.status} options={report.statuses} onChange={(e) => set('status', e.value ?? null)} showClear placeholder="All" />
                                </label>
                            ) : (
                                <label className="rp-field">
                                    <span>{report.statusLabel ?? 'Status'}</span>
                                    <InputText value={filters.status ?? ''} onChange={(e) => set('status', e.target.value || null)} placeholder="All" />
                                </label>
                            )
                        )}
                        {report.filters.includes('dateRange') && (
                            <>
                                <label className="rp-field rp-date">
                                    <span>{report.dateLabel ?? 'Date'} from</span>
                                    <Calendar value={filters.from} onChange={(e) => set('from', (e.value as Date) ?? null)} dateFormat="dd M yy" showIcon showButtonBar maxDate={filters.to ?? undefined} placeholder="Any" />
                                </label>
                                <label className="rp-field rp-date">
                                    <span>to</span>
                                    <Calendar value={filters.to} onChange={(e) => set('to', (e.value as Date) ?? null)} dateFormat="dd M yy" showIcon showButtonBar minDate={filters.from ?? undefined} placeholder="Any" />
                                </label>
                            </>
                        )}
                        {report.filters.includes('days') && (
                            <label className="rp-field rp-days">
                                <span>{report.daysLabel ?? 'Days'}</span>
                                <InputNumber value={filters.days} onValueChange={(e) => set('days', e.value ?? null)} min={0} max={3650} placeholder="Any" useGrouping={false} />
                            </label>
                        )}
                        {report.filters.includes('overdueOnly') && (
                            <label className="rp-check">
                                <Checkbox checked={filters.overdueOnly} onChange={(e) => set('overdueOnly', !!e.checked)} />
                                <span>Overdue only</span>
                            </label>
                        )}
                        {report.filters.includes('topLevelOnly') && (
                            <label className="rp-check">
                                <Checkbox checked={filters.topLevelOnly} onChange={(e) => set('topLevelOnly', !!e.checked)} />
                                <span>Top-level manuals only</span>
                            </label>
                        )}
                        <span className="rp-spacer" />
                        <Button type="button" className="rp-link" label="Reset" icon="pi pi-filter-slash" text onClick={() => { setFilters(initial); setSearch(''); }} />
                    </div>

                    <div className="rp-bar">
                        <span className="rp-count" aria-live="polite">
                            {loading ? 'Running…' : `${visible.length.toLocaleString()} row${visible.length === 1 ? '' : 's'}${shown && shown.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''}`}
                        </span>
                        <span className="rp-search">
                            <i className="pi pi-search" aria-hidden="true" />
                            <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in the results" aria-label="Search in the results" />
                        </span>
                        <Button type="button" className="rp-link" icon="pi pi-refresh" text aria-label="Run again" tooltip="Run again" tooltipOptions={{ position: 'bottom' }} onClick={run} disabled={loading} />
                    </div>

                    {error ? (
                        <div className="rp-error" role="alert"><i className="pi pi-exclamation-circle" aria-hidden="true" /> {error}</div>
                    ) : (
                        <div className="rp-table">
                            <DataTable value={tableRows} loading={loading} size="small" stripedRows removableSort
                                scrollable scrollHeight="flex" paginator={tableRows.length > 50} rows={50} rowsPerPageOptions={[50, 100, 250]}
                                globalFilter={search} globalFilterFields={report.columns.map((c) => c.field)}
                                onValueChange={(v) => setShown(v as Row[])}
                                emptyMessage={loading ? ' ' : 'No rows for these filters.'}>
                                {report.columns.map((c) => (
                                    <Column key={c.field} field={c.field} sortField={sortField(c)} header={c.header} sortable body={cell(c)}
                                        headerClassName={c.type === 'number' ? 'rp-num-head' : undefined}
                                        style={{ minWidth: `${Math.round(90 * (c.weight ?? 1))}px` }} />
                                ))}
                            </DataTable>
                        </div>
                    )}
                </section>
    );
};

/** The vessel and document-type lists the report filters offer, loaded once. */
const useFilterLists = () => {
    const [vessels, setVessels] = useState<VesselOption[]>([]);
    const [docTypes, setDocTypes] = useState<Option[]>([]);
    useEffect(() => {
        let alive = true;
        featureApi.vessels().then((v) => { if (alive) setVessels(v); }).catch(() => { if (alive) setVessels([]); });
        dmsLifecycleService.getApiCall<{ documentType?: string }[]>('OtherDocument/GetTypes')
            .then((types) => {
                if (!alive) return;
                setDocTypes(Array.from(new Set((types || []).map((t) => t.documentType).filter((t): t is string => !!t)))
                    .sort((a, b) => a.localeCompare(b)).map((t) => ({ label: t, value: t })));
            })
            .catch(() => { if (alive) setDocTypes([]); });
        return () => { alive = false; };
    }, []);
    return { vessels, docTypes };
};

/**
 * The reports of one area (manuals, circulars, alerts, other documents) and the chosen report (filters, results,
 * Excel / PDF / CSV export). Opened from that area; there is no separate Reports page.
 *   layout "list" - the reports listed on the left (the Manuals / Circulars report windows);
 *   layout "tabs" - the reports as tabs above the report, no side list (Other documents > All vessels).
 */
export const ReportPanel: React.FC<{ context: ReportContextKey; className?: string; layout?: 'list' | 'tabs' }> = ({ context, className, layout = 'list' }) => {
    const area = REPORT_CONTEXTS[context];
    const items = useMemo(() => area.reports
        .map((use) => ({ use, report: reportByKey(use.key) }))
        .filter((x): x is { use: ContextReport; report: ReportDefinition } => x.report != null), [area]);
    const [index, setIndex] = useState(0);
    const { vessels, docTypes } = useFilterLists();
    const current = items[Math.min(index, items.length - 1)];
    if (!current) return null;
    const view = <ReportView key={`${current.use.key}-${index}`} report={current.report} use={current.use} vessels={vessels} docTypes={docTypes} />;

    if (layout === 'tabs') {
        return (
            <div className={`rp-tabbed${className ? ` ${className}` : ''}`}>
                <div className="rp-tabs" role="tablist" aria-label={area.title}>
                    {items.map((x, i) => (
                        <button key={`${x.use.key}-${i}`} type="button" role="tab" aria-selected={i === index}
                            className={`rp-tab${i === index ? ' active' : ''}`} onClick={() => setIndex(i)}>
                            <i className={x.report.icon} aria-hidden="true" />
                            <span>{x.use.title ?? x.report.title}</span>
                        </button>
                    ))}
                </div>
                {view}
            </div>
        );
    }

    return (
        <div className={`rp-main rp-panel${className ? ` ${className}` : ''}`}>
            <nav className="rp-catalog" aria-label={area.title}>
                <div className="rp-group">
                    <div className="rp-group-title">{area.title}</div>
                    {items.map((x, i) => (
                        <button key={`${x.use.key}-${i}`} type="button" className={`rp-item${i === index ? ' active' : ''}`}
                            aria-current={i === index ? 'page' : undefined} onClick={() => setIndex(i)}>
                            <i className={x.report.icon} aria-hidden="true" />
                            <span>{x.use.title ?? x.report.title}</span>
                        </button>
                    ))}
                </div>
            </nav>
            {view}
        </div>
    );
};
