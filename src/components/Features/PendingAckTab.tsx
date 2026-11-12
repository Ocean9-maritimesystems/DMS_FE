import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { Checkbox } from 'primereact/checkbox';
import authService from '../../services/authService';
import featureApi, { AckPendingRow, AckVesselSummary, CircularCategorySetting, FeatureSettings, itemLink } from '../../services/featureApi';
import { errorMessage } from '../../services/DMSLifecycleService';
import notify from '../../services/notify';
import { formatDate, formatDateTime } from '../utils/formatDate';
import './Features.scss';

const ITEM_OPTIONS = [
    { label: 'All', value: null },
    { label: 'Manuals', value: 'Manual' },
    { label: 'Circulars', value: 'Circular' },
    { label: 'Alerts', value: 'Alert' },
];

const dueBody = (r: AckPendingRow) => (
    <span className={r.overdue ? 'feature-tag overdue' : ''}>{formatDate(r.dueOn)}{r.overdue ? ' · overdue' : ''}</span>
);

/** Feature 1: who still has to acknowledge what, per vessel and rank, and in the office. */
const PendingAckTab: React.FC = () => {
    const navigate = useNavigate();
    const isAdmin = (authService.currentUser()?.role ?? '').toLowerCase() === 'admin';
    const [view, setView] = useState<'vessels' | 'office'>('vessels');
    const [summary, setSummary] = useState<AckVesselSummary[]>([]);
    const [vesselId, setVesselId] = useState<number | null>(null);
    const [rows, setRows] = useState<AckPendingRow[]>([]);
    const [itemType, setItemType] = useState<string | null>(null);
    const [rank, setRank] = useState<string | null>(null);
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const loadSummary = useCallback(() => {
        featureApi.pending.vessels().then(setSummary).catch((err) => notify.error(errorMessage(err), 'Could not load pending acknowledgements'));
    }, []);

    const loadRows = useCallback(async () => {
        setLoading(true);
        try {
            setRows(view === 'office' ? await featureApi.pending.office(null) : await featureApi.pending.vessel(vesselId, itemType, null));
        } catch (err) {
            notify.error(errorMessage(err), 'Could not load pending acknowledgements');
        } finally {
            setLoading(false);
        }
    }, [view, vesselId, itemType]);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadRows(); }, [loadRows]);

    const ranks = useMemo(() => Array.from(new Set(rows.map((r) => r.rank).filter(Boolean))) as string[], [rows]);
    const shown = useMemo(() => rows.filter((r) =>
        (!rank || r.rank === rank) && (!overdueOnly || r.overdue) && (view === 'vessels' || !itemType || r.itemType === itemType)), [rows, rank, overdueOnly, view, itemType]);

    const totals = useMemo(() => summary.reduce((t, s) => ({
        pending: t.pending + s.manualsPending + s.circularsPending + s.alertsPending,
        overdue: t.overdue + s.manualsOverdue + s.circularsOverdue + s.alertsOverdue,
    }), { pending: 0, overdue: 0 }), [summary]);

    const open = (r: AckPendingRow) => {
        const link = itemLink(r.itemType, r.itemID);
        navigate({ pathname: link.pathname, search: link.search }, { state: link.state });
    };

    return (
        <div className="feature-main" style={{ padding: 0 }}>
            <div className="feature-toolbar">
                <SelectButton value={view} options={[{ label: 'Vessels', value: 'vessels' }, { label: 'Office', value: 'office' }]}
                    onChange={(e) => { if (e.value) { setView(e.value); setRank(null); } }} />
                {view === 'vessels' && <span>{totals.pending} pending on board, <strong>{totals.overdue} overdue</strong></span>}
                <span className="spacer" />
                {isAdmin && <Button label="Settings" icon="pi pi-sliders-h" outlined onClick={() => setShowSettings(true)} />}
                <Button icon="pi pi-refresh" text aria-label="Refresh" onClick={() => { loadSummary(); loadRows(); }} />
            </div>

            {view === 'vessels' && (
                <div className="pending-cards">
                    {summary.map((s) => {
                        const pending = s.manualsPending + s.circularsPending + s.alertsPending;
                        const overdue = s.manualsOverdue + s.circularsOverdue + s.alertsOverdue;
                        return (
                            <div key={s.vesselID} role="button" tabIndex={0}
                                className={`feature-card pending-card${vesselId === s.vesselID ? ' selected' : ''}`}
                                onClick={() => setVesselId(vesselId === s.vesselID ? null : s.vesselID)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setVesselId(vesselId === s.vesselID ? null : s.vesselID); }}>
                                <h4>{s.vesselName}</h4>
                                <div className="counts">
                                    <span className={`feature-tag ${pending ? 'warn' : 'ok'}`}>{pending} pending</span>
                                    {overdue > 0 && <span className="feature-tag overdue">{overdue} overdue</span>}
                                </div>
                                <div className="counts" style={{ marginTop: 6, fontSize: '0.78rem' }}>
                                    <span>Manuals {s.manualsPending}</span>·<span>Circulars {s.circularsPending}</span>·<span>Alerts {s.alertsPending}</span>
                                </div>
                                <div className="sync">Last sync: {s.lastSyncUtc ? formatDateTime(s.lastSyncUtc) : 'never'}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="feature-card">
                <div className="feature-toolbar" style={{ marginBottom: 8 }}>
                    <strong>{view === 'office' ? 'Office users' : vesselId ? summary.find((s) => s.vesselID === vesselId)?.vesselName : 'All vessels'}</strong>
                    <Dropdown value={itemType} options={ITEM_OPTIONS} onChange={(e) => setItemType(e.value)} />
                    <Dropdown value={rank} options={[{ label: view === 'office' ? 'All roles' : 'All ranks', value: null }, ...ranks.map((r) => ({ label: r, value: r }))]}
                        onChange={(e) => setRank(e.value)} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Checkbox inputId="pa-overdue" checked={overdueOnly} onChange={(e) => setOverdueOnly(!!e.checked)} />
                        <label htmlFor="pa-overdue">Overdue only</label>
                    </span>
                    <span className="spacer" />
                    <span>{shown.length} item(s)</span>
                </div>
                <DataTable value={shown} loading={loading} paginator rows={25} size="small" stripedRows sortField="dueOn" sortOrder={1}
                    emptyMessage="Nothing waiting for acknowledgement." rowHover onRowClick={(e) => open(e.data as AckPendingRow)}>
                    {view === 'vessels' && !vesselId && <Column field="vesselName" header="Vessel" sortable />}
                    <Column field="itemType" header="Type" sortable style={{ width: 100 }} />
                    <Column field="number" header="No." sortable />
                    <Column field="title" header="Title" sortable />
                    <Column field="rank" header={view === 'office' ? 'Role' : 'Rank'} sortable />
                    <Column field="userName" header="Name" sortable />
                    {view === 'office' && <Column field="dept" header="Dept." sortable />}
                    <Column field="releasedOn" header="Released" sortable body={(r: AckPendingRow) => formatDate(r.releasedOn)} />
                    <Column field="dueOn" header="Due" sortable body={dueBody} />
                    <Column field="daysWaiting" header="Days" sortable style={{ width: 80 }} />
                </DataTable>
            </div>

            {showSettings && <FeatureSettingsDialog onHide={() => { setShowSettings(false); loadSummary(); loadRows(); }} />}
        </div>
    );
};

/** Admin settings for the new features (DM_Settings / CIR_Setting; they go to the vessels with the sync). */
export const FeatureSettingsDialog: React.FC<{ onHide: () => void }> = ({ onHide }) => {
    const [s, setS] = useState<FeatureSettings | null>(null);
    const [categories, setCategories] = useState<CircularCategorySetting[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        featureApi.pending.settings().then(setS).catch((err) => notify.error(errorMessage(err)));
        featureApi.circular.categories().then(setCategories).catch(() => setCategories([]));
    }, []);

    const save = async () => {
        if (!s) return;
        setBusy(true);
        try {
            await featureApi.pending.saveSettings(s);
            notify.success('Settings saved; vessels get them with the next sync.');
            onHide();
        } catch (err) {
            notify.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const toggleCategory = async (c: CircularCategorySetting, value: boolean) => {
        try {
            await featureApi.circular.saveCategory({ ...c, requiresValidUntil: value });
            setCategories((list) => list.map((x) => (x.ciR_CategoryID === c.ciR_CategoryID ? { ...x, requiresValidUntil: value } : x)));
        } catch (err) {
            notify.error(errorMessage(err));
        }
    };

    const num = (key: keyof FeatureSettings) => (
        <InputNumber value={(s?.[key] as number) ?? null} min={0} max={key === 'folderMaxFiles' ? 100000 : 3650} useGrouping={false}
            onValueChange={(e) => setS((x) => (x ? { ...x, [key]: e.value ?? 0 } : x))} />
    );

    return (
        <Dialog header="Settings" visible onHide={onHide} style={{ width: '760px', maxWidth: '96vw' }}>
            {!s ? <p>Loading…</p> : (
                <div className="feature-form">
                    <div className="field full">
                        <label htmlFor="fs-ranks">Ranks that see the whole ship's pending items and suggestions</label>
                        <InputText id="fs-ranks" value={s.allowedRolesToViewAllRankPendingItems ?? ''}
                            onChange={(e) => setS({ ...s, allowedRolesToViewAllRankPendingItems: e.target.value })} />
                        <span className="hint">Comma-separated, e.g. Master, Chief Engineer. Other ranks see only their own.</span>
                    </div>
                    <div className="field"><label>Days to acknowledge a manual</label>{num('defaultAckDueDaysManual')}</div>
                    <div className="field"><label>Days to acknowledge a circular</label>{num('defaultAckDueDaysCircular')}</div>
                    <div className="field"><label>Days to acknowledge an alert</label>{num('defaultAckDueDaysAlert')}</div>
                    <div className="field"><span className="hint">Filled into each new manual or circular; can be changed per record.</span></div>
                    <div className="field"><label>Largest file in a folder (MB)</label>{num('folderMaxFileSizeMB')}</div>
                    <div className="field"><label>Most files in one folder</label>{num('folderMaxFiles')}</div>
                    <div className="field full">
                        <label>Circular categories that need a "valid until" date</label>
                        <DataTable value={categories} size="small" scrollable scrollHeight="220px">
                            <Column field="circularType" header="Type" />
                            <Column field="category" header="Category" />
                            <Column header="Valid until required" body={(c: CircularCategorySetting) => (
                                <Checkbox checked={c.requiresValidUntil} onChange={(e) => toggleCategory(c, !!e.checked)} />
                            )} />
                        </DataTable>
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <Button label="Cancel" text onClick={onHide} />
                <Button label="Save" icon="pi pi-check" loading={busy} disabled={!s} onClick={save} />
            </div>
        </Dialog>
    );
};

export default PendingAckTab;
