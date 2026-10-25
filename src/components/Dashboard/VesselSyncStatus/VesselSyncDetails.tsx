import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { TabView, TabPanel } from 'primereact/tabview';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { Button } from 'primereact/button';
import dmsLifecycleService, { errorMessage } from '../../../services/DMSLifecycleService';
import { formatDate } from '../../utils/formatDate';

/**
 * Per-vessel sync details, opened from the Vessel Sync Status tab.
 *   Items sent:   manuals and circulars/alerts assigned to the vessel, how far they are acknowledged,
 *                 and whether the vessel already has them (On board) or they are waiting (Queued).
 *   Sync history: the vessel's sync key (generate / replace) and a forced resync, then every sync call.
 */
interface VesselSyncItem {
    itemType: string;
    itemID: number;
    number?: string;
    title?: string;
    version?: string;
    category?: string;
    issuedOn?: string;
    ranksRequired: number;
    ranksAcknowledged: number;
    lastReadOn?: string;
    status: string;
    /** On board | Queued | null when vessel sync is not set up */
    delivery?: string | null;
}

interface VesselSyncLogEntry {
    syncLogID: number;
    /** Down = office to vessel, Up = vessel to office */
    direction: string;
    startedUtc: string;
    finishedUtc?: string | null;
    itemsCount: number;
    status: string;
    error?: string | null;
}

interface VesselSyncHistory {
    syncInstalled: boolean;
    hasKey: boolean;
    keyCreatedUtc?: string | null;
    keyCreatedBy?: string | null;
    keyLastUsedUtc?: string | null;
    /** Why the key could not be read (the history is still shown). */
    keyError?: string | null;
    entries: VesselSyncLogEntry[];
}

interface VesselSyncDetailsProps {
    visible: boolean;
    vesselId: number;
    vesselName: string;
    onHide: () => void;
    /** Called after the key was generated or a resync requested, so the monitor can refresh. */
    onChanged?: () => void;
}

const TYPE_FILTERS = [
    { label: 'All', value: 'all' },
    { label: 'Manuals', value: 'Manual' },
    { label: 'Circulars', value: 'Circular' },
    { label: 'Alerts', value: 'Alert' },
];

const typeIcon: Record<string, string> = {
    Manual: 'pi-book',
    Circular: 'pi-inbox',
    Alert: 'pi-bell',
};

const HISTORY_FILTERS = [
    { label: 'All', value: 'all' },
    { label: 'OK', value: 'OK' },
    { label: 'Failed', value: 'Failed' },
];

/** Compact pager: first / previous / "1–15 of 55" / next / last, and rows per page. */
const PAGER = 'FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown';
const PAGE_REPORT = '{first}–{last} of {totalRecords}';

const statusClass = (status: string) => {
    switch (status) {
        case 'Acknowledged': return 'vs-pill ok';
        case 'Partly acknowledged': return 'vs-pill part';
        case 'Pending': return 'vs-pill pending';
        default: return 'vs-pill neutral';
    }
};

/** Times from the sync tables are UTC; show them in the user's time. */
const formatDateTime = (value?: string | null) => {
    if (!value) return '';
    const d = new Date(value.endsWith('Z') || value.includes('+') ? value : `${value}Z`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

const duration = (from: string, to?: string | null) => {
    if (!to) return '';
    const ms = new Date(`${to}`.endsWith('Z') ? to : `${to}Z`).getTime() - new Date(`${from}`.endsWith('Z') ? from : `${from}Z`).getTime();
    if (Number.isNaN(ms) || ms < 0) return '';
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
};

const VesselSyncDetails: React.FC<VesselSyncDetailsProps> = ({ visible, vesselId, vesselName, onHide, onChanged }) => {
    const [tab, setTab] = useState(0);
    const [items, setItems] = useState<VesselSyncItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemsError, setItemsError] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [search, setSearch] = useState('');

    const [history, setHistory] = useState<VesselSyncHistory | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [historyFilter, setHistoryFilter] = useState('all');

    // Sync key and resync
    const [newKey, setNewKey] = useState('');
    const [copied, setCopied] = useState(false);
    const [confirming, setConfirming] = useState<'key' | 'resync' | null>(null);
    const [setupBusy, setSetupBusy] = useState(false);
    const [setupMessage, setSetupMessage] = useState('');
    const [setupError, setSetupError] = useState('');

    const loadItems = useCallback(() => {
        setItemsLoading(true);
        setItemsError('');
        dmsLifecycleService.getApiCall(`Vessel/GetVesselSyncItems?vesselId=${vesselId}`)
            .then((data: VesselSyncItem[]) => setItems(data || []))
            .catch((err: unknown) => { setItems([]); setItemsError(errorMessage(err)); })
            .finally(() => setItemsLoading(false));
    }, [vesselId]);

    const loadHistory = useCallback(() => {
        setHistoryLoading(true);
        setHistoryError('');
        dmsLifecycleService.getApiCall(`Vessel/GetVesselSyncHistory?vesselId=${vesselId}`)
            .then((data: VesselSyncHistory) => setHistory({ ...data, entries: data?.entries || [] }))
            .catch((err: unknown) => { setHistory(null); setHistoryError(errorMessage(err)); })
            .finally(() => setHistoryLoading(false));
    }, [vesselId]);

    useEffect(() => {
        if (!visible) return;
        setTab(0);
        setTypeFilter('all');
        setHistoryFilter('all');
        setSearch('');
        setNewKey('');
        setCopied(false);
        setConfirming(null);
        setSetupMessage('');
        setSetupError('');
        loadItems();
        loadHistory();
    }, [visible, loadItems, loadHistory]);

    const counts = useMemo(() => {
        const c = { total: items.length, acknowledged: 0, pending: 0, queued: 0, onBoard: 0 };
        items.forEach((i) => {
            if (i.status === 'Acknowledged') c.acknowledged += 1;
            else if (i.status === 'Pending' || i.status === 'Partly acknowledged') c.pending += 1;
            if (i.delivery === 'Queued') c.queued += 1;
            else if (i.delivery) c.onBoard += 1;
        });
        return c;
    }, [items]);

    const visibleItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        return items.filter((i) =>
            (typeFilter === 'all' || i.itemType === typeFilter) &&
            (!term || `${i.number ?? ''} ${i.title ?? ''} ${i.category ?? ''}`.toLowerCase().includes(term)));
    }, [items, typeFilter, search]);

    const hasDelivery = items.some((i) => i.delivery);

    const entries = useMemo(() => history?.entries ?? [], [history]);
    const shownEntries = useMemo(
        () => entries.filter((e) => historyFilter === 'all' || (historyFilter === 'OK' ? e.status === 'OK' : e.status !== 'OK')),
        [entries, historyFilter],
    );
    const lastSync = entries[0];
    const lastOk = entries.find((e) => e.status === 'OK');
    const failedCount = entries.filter((e) => e.status !== 'OK').length;

    // ---- Sync key and resync ----

    const generateKey = async () => {
        setSetupBusy(true);
        setSetupError('');
        setSetupMessage('');
        try {
            const result = await dmsLifecycleService.postApiCall(`Vessel/GenerateSyncKey?vesselId=${vesselId}`);
            setNewKey(result?.key || '');
            setCopied(false);
            setConfirming(null);
            loadHistory();
            onChanged?.();
        } catch (err) {
            setSetupError(errorMessage(err));
        } finally {
            setSetupBusy(false);
        }
    };

    const requestResync = async () => {
        setSetupBusy(true);
        setSetupError('');
        setSetupMessage('');
        try {
            await dmsLifecycleService.postApiCall(`Vessel/RequestResync?vesselId=${vesselId}`);
            setConfirming(null);
            setSetupMessage('Everything will be sent again on the vessel’s next sync.');
            loadItems();
            onChanged?.();
        } catch (err) {
            setSetupError(errorMessage(err));
        } finally {
            setSetupBusy(false);
        }
    };

    const copyKey = async () => {
        try {
            await navigator.clipboard.writeText(newKey);
            setCopied(true);
        } catch {
            setCopied(false); // the key is selectable, so it can still be copied by hand
        }
    };

    // ---- Cells ----

    const typeBody = (row: VesselSyncItem) => (
        <span className="vs-type"><i className={`pi ${typeIcon[row.itemType] || 'pi-file'}`} />{row.itemType}</span>
    );

    const titleBody = (row: VesselSyncItem) => (
        <div className="vs-title">
            <span className="vs-title-main">{row.title || '—'}</span>
            <span className="vs-title-sub">
                {[row.number, row.version && `v${row.version}`, row.category].filter(Boolean).join(' · ')}
            </span>
        </div>
    );

    const ackBody = (row: VesselSyncItem) => row.ranksRequired > 0
        ? (
            <span className="vs-ack" title={`${row.ranksAcknowledged} of ${row.ranksRequired} ranks have acknowledged`}>
                <span className="vs-ack-bar"><span style={{ width: `${Math.min(100, (row.ranksAcknowledged / row.ranksRequired) * 100)}%` }} /></span>
                <span>{row.ranksAcknowledged}/{row.ranksRequired}</span>
            </span>
        )
        : <span className="vs-muted">Not required</span>;

    const deliveryBody = (row: VesselSyncItem) => !row.delivery
        ? <span className="vs-muted">—</span>
        : <span className={row.delivery === 'Queued' ? 'vs-pill part' : 'vs-pill neutral'}>{row.delivery}</span>;

    const setupBody = () => {
        if (!history?.syncInstalled) return null;
        return (
            <div className="vs-setup">
                <div className="vs-setup-row">
                    <div className="vs-setup-text">
                        <strong>Sync key</strong>
                        {history.hasKey ? (
                            <span>
                                Generated {formatDateTime(history.keyCreatedUtc)}
                                {history.keyCreatedBy ? ` by ${history.keyCreatedBy}` : ''} ·{' '}
                                {history.keyLastUsedUtc ? `last used ${formatDateTime(history.keyLastUsedUtc)}` : 'not used by the vessel yet'}
                            </span>
                        ) : (
                            <span>No key yet: the vessel cannot sync until one is generated and set on board.</span>
                        )}
                    </div>
                    <div className="vs-setup-actions">
                        <Button
                            type="button"
                            label={history.hasKey ? 'Replace key' : 'Generate sync key'}
                            icon="pi pi-lock"
                            className={history.hasKey ? 'p-button-outlined' : ''}
                            disabled={setupBusy}
                            onClick={() => (history.hasKey ? setConfirming('key') : generateKey())}
                        />
                        <Button
                            type="button"
                            label="Force resync"
                            icon="pi pi-replay"
                            className="p-button-outlined"
                            disabled={setupBusy}
                            onClick={() => setConfirming('resync')}
                        />
                    </div>
                </div>

                {confirming === 'key' && (
                    <div className="vs-confirm">
                        <span>The vessel stops syncing until the new key is put in its settings. Replace the key?</span>
                        <Button type="button" label="Replace" className="p-button-danger" onClick={generateKey} loading={setupBusy} />
                        <Button type="button" label="Cancel" className="p-button-text" onClick={() => setConfirming(null)} disabled={setupBusy} />
                    </div>
                )}
                {confirming === 'resync' && (
                    <div className="vs-confirm">
                        <span>Send every manual and circular to {vesselName} again on its next sync? Over a slow link this can take a while.</span>
                        <Button type="button" label="Resync" onClick={requestResync} loading={setupBusy} />
                        <Button type="button" label="Cancel" className="p-button-text" onClick={() => setConfirming(null)} disabled={setupBusy} />
                    </div>
                )}

                {newKey && (
                    <div className="vs-key">
                        <strong>Copy this key now: it is not shown again.</strong>
                        <div className="vs-key-value">
                            <code>{newKey}</code>
                            <Button
                                type="button"
                                icon={copied ? 'pi pi-check' : 'pi pi-copy'}
                                label={copied ? 'Copied' : 'Copy'}
                                className="p-button-sm p-button-outlined"
                                onClick={copyKey}
                            />
                        </div>
                        <span>
                            On the vessel server, set it in <code>appsettings.json</code> as <code>"Sync": {'{'} "VesselId": {vesselId}, "VesselKey": "…" {'}'}</code> and restart the DMS vessel service.
                        </span>
                    </div>
                )}
                {setupMessage && <span className="vs-muted">{setupMessage}</span>}
                {setupError && <span className="vs-setup-error"><i className="pi pi-exclamation-triangle" /> {setupError}</span>}
            </div>
        );
    };

    const historyBody = () => {
        if (historyLoading && !history) return <div className="vs-empty"><i className="pi pi-spin pi-spinner" /> Loading…</div>;
        if (historyError) {
            return (
                <div className="vs-empty error">
                    <i className="pi pi-exclamation-triangle" />
                    <div>
                        <strong>The sync history could not be loaded.</strong>
                        <p>{historyError}</p>
                        <Button type="button" label="Try again" icon="pi pi-refresh" className="p-button-sm p-button-outlined vs-retry" onClick={loadHistory} />
                    </div>
                </div>
            );
        }
        if (history && !history.syncInstalled) {
            return (
                <div className="vs-empty">
                    <i className="pi pi-info-circle" />
                    <div>
                        <strong>Vessel sync is not set up yet.</strong>
                        <p>Run <code>Database/005_VesselSync.sql</code> on the office database. Sync keys and the history
                            of each sync then appear here.</p>
                    </div>
                </div>
            );
        }
        return (
            <>
                {setupBody()}
                {history?.keyError && <span className="vs-setup-error"><i className="pi pi-exclamation-triangle" /> The sync key could not be read: {history.keyError}</span>}
                <div className="vs-toolbar">
                    <SelectButton value={historyFilter} options={HISTORY_FILTERS} onChange={(e) => e.value && setHistoryFilter(e.value)} className="vs-type-filter" />
                    <span className="vs-history-facts">
                        <span>Last sync <strong>{lastSync ? formatDateTime(lastSync.startedUtc) : 'never'}</strong></span>
                        <span>Last success <strong>{lastOk ? formatDateTime(lastOk.startedUtc) : 'never'}</strong></span>
                        {failedCount > 0 && <span className="vs-pill pending">{failedCount} failed</span>}
                    </span>
                    <Button type="button" icon="pi pi-refresh" className="p-button-text p-button-sm" aria-label="Refresh" title="Refresh" onClick={loadHistory} />
                </div>
                <DataTable
                    value={shownEntries}
                    dataKey="syncLogID"
                    size="small"
                    stripedRows
                    loading={historyLoading}
                    paginator={shownEntries.length > 15}
                    rows={15}
                    rowsPerPageOptions={[15, 30, 50]}
                    paginatorTemplate={PAGER}
                    currentPageReportTemplate={PAGE_REPORT}
                    scrollable
                    scrollHeight="flex"
                    className="vs-table"
                    emptyMessage={entries.length ? 'No sync calls match.' : 'No sync calls recorded for this vessel yet.'}
                >
                    <Column header="Started" body={(r: VesselSyncLogEntry) => formatDateTime(r.startedUtc)} style={{ width: 180 }} />
                    <Column header="Direction" body={(r: VesselSyncLogEntry) => (
                        <span className="vs-type">
                            <i className={`pi ${r.direction === 'Down' ? 'pi-arrow-down' : 'pi-arrow-up'}`} />
                            {r.direction === 'Down' ? 'Office to vessel' : 'Vessel to office'}
                        </span>
                    )} style={{ width: 160 }} />
                    <Column header="Items" field="itemsCount" style={{ width: 70 }} />
                    <Column header="Status" body={(r: VesselSyncLogEntry) => (
                        <span className={r.status === 'OK' ? 'vs-pill ok' : 'vs-pill pending'}>{r.status === 'OK' ? 'OK' : 'Failed'}</span>
                    )} style={{ width: 90 }} />
                    <Column header="Took" body={(r: VesselSyncLogEntry) => duration(r.startedUtc, r.finishedUtc)} style={{ width: 80 }} />
                    <Column header="Error" body={(r: VesselSyncLogEntry) => <span className="vs-muted">{r.error}</span>} />
                </DataTable>
            </>
        );
    };

    const header = (
        <div className="vs-dialog-head">
            <div className="vs-dialog-title">
                <span className="vs-dialog-icon"><i className="pi pi-sync" /></span>
                <div>
                    <span className="vs-dialog-name">{vesselName}</span>
                    <span className="vs-muted">Sync details</span>
                </div>
            </div>
            <div className="vs-stats" aria-label="Summary">
                <span><strong>{counts.total}</strong> sent</span>
                {hasDelivery && <span><strong>{counts.onBoard}</strong> on board</span>}
                {hasDelivery && <span className={counts.queued ? 'is-warn' : ''}><strong>{counts.queued}</strong> queued</span>}
                <span className="is-ok"><strong>{counts.acknowledged}</strong> acknowledged</span>
                <span className={counts.pending ? 'is-bad' : ''}><strong>{counts.pending}</strong> waiting</span>
            </div>
        </div>
    );

    return (
        <Dialog
            visible={visible}
            onHide={onHide}
            header={header}
            style={{ width: 'min(1100px, 96vw)', height: 'min(760px, 92vh)' }}
            className="vs-dialog"
            modal
            draggable={false}
        >
            <TabView activeIndex={tab} onTabChange={(e) => setTab(e.index)} className="vs-tabs">
                <TabPanel header={`Items sent (${counts.total})`}>
                    <div className="vs-toolbar">
                        <SelectButton
                            value={typeFilter}
                            options={TYPE_FILTERS}
                            onChange={(e) => e.value && setTypeFilter(e.value)}
                            className="vs-type-filter"
                        />
                        <span className="vs-search">
                            <i className="pi pi-search" />
                            <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or title" />
                        </span>
                    </div>
                    {itemsError ? (
                        <div className="vs-empty error"><i className="pi pi-exclamation-triangle" /> {itemsError}</div>
                    ) : (
                        <DataTable
                            value={visibleItems}
                            dataKey="itemID"
                            loading={itemsLoading}
                            size="small"
                            stripedRows
                            paginator={visibleItems.length > 15}
                            rows={15}
                            rowsPerPageOptions={[15, 30, 50]}
                            paginatorTemplate={PAGER}
                            currentPageReportTemplate={PAGE_REPORT}
                            scrollable
                            scrollHeight="flex"
                            className="vs-table"
                            sortField="issuedOn"
                            sortOrder={-1}
                            emptyMessage={itemsLoading ? 'Loading…' : 'Nothing has been sent to this vessel.'}
                        >
                            <Column header="Type" body={typeBody} field="itemType" sortable style={{ width: 110 }} />
                            <Column header="Title" body={titleBody} field="title" sortable />
                            <Column header="Issued" field="issuedOn" sortable body={(r: VesselSyncItem) => formatDate(r.issuedOn ?? '', '')} style={{ width: 115 }} />
                            {hasDelivery && <Column header="On vessel" field="delivery" sortable body={deliveryBody} style={{ width: 105 }} />}
                            <Column header="Acknowledged" body={ackBody} style={{ width: 140 }} />
                            <Column header="Status" field="status" sortable body={(r: VesselSyncItem) => <span className={statusClass(r.status)}>{r.status}</span>} style={{ width: 160 }} />
                        </DataTable>
                    )}
                </TabPanel>
                <TabPanel header="Sync history">
                    {historyBody()}
                </TabPanel>
            </TabView>
        </Dialog>
    );
};

export default VesselSyncDetails;
