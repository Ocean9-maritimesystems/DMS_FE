import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabView, TabPanel } from 'primereact/tabview';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import PageHeader from '../PageHeader';
import PendingTable from './PendingTable';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import authService from '../../services/authService';
import notify from '../../services/notify';
import featureApi, { CircularCategorySetting } from '../../services/featureApi';
import { AckPendingRow, AckVesselSummary, FeatureSettings } from '../../types/api';
import { formatDateTime } from '../utils/formatDate';
import './PendingAckPage.scss';

/** 'all' rather than '': a PrimeReact Dropdown shows no label for an empty-string value. */
const ALL = 'all';

const ITEM_TYPES = [
    { label: 'All items', value: ALL },
    { label: 'Manuals', value: 'Manual' },
    { label: 'Circulars', value: 'Circular' },
    { label: 'Alerts', value: 'Alert' },
];

const TABS = ['mine', 'vessels', 'office', 'settings'] as const;
type Tab = (typeof TABS)[number];

/** Small "pending (overdue)" cell for the vessel summary. */
const Count: React.FC<{ pending: number; overdue: number }> = ({ pending, overdue }) => (
    <span className="pa-count">
        <strong>{pending}</strong>
        {overdue > 0 && <span className="pa-badge pa-badge-overdue">{overdue} overdue</span>}
    </span>
);

/** "Overdue only" tick box used by the Vessels and Office lists. */
const OverdueToggle: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void }> = ({ id, checked, onChange }) => (
    <span className="pa-check">
        <Checkbox inputId={id} checked={checked} onChange={(e) => onChange(!!e.checked)} />
        <label htmlFor={id}>Overdue only</label>
    </span>
);

/** Loads a list from the API with a loading flag and a readable error. */
function useApiList<T>(endpoint: string | null) {
    const [rows, setRows] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!endpoint) return;
        setLoading(true);
        setError(null);
        try {
            setRows((await dmsLifecycleService.getApiCall<T[]>(endpoint)) ?? []);
        } catch (err) {
            setRows([]);
            setError(errorMessage(err, 'The list could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }, [endpoint]);

    useEffect(() => {
        load();
    }, [load]);

    return { rows, loading, error, reload: load };
}

const ErrorLine: React.FC<{ error: string | null }> = ({ error }) =>
    error ? (
        <div className="pa-error" role="alert">
            <i className="pi pi-exclamation-circle" aria-hidden="true" /> {error}
        </div>
    ) : null;

/**
 * Pending acknowledgements: who still has to acknowledge which manual, circular or alert.
 *   My items     - what the logged-in user has to acknowledge          (GET api/Pending/Mine)
 *   Vessels      - per vessel, then per crew member and rank            (GET api/Pending/Vessels, /Vessel)
 *   Office users - administrators: everyone in the office               (GET api/Pending/Office)
 *   Settings     - administrators: default days to acknowledge, etc.   (GET/PUT api/Pending/Settings)
 *                  and which circular categories need a "valid until" date (api/Circular/CategorySettings)
 * This is the only pending-acknowledgement screen (it replaced the Dashboard's "Pending Acknowledgements" tab).
 * A vessel's acknowledgements are known at the office only as far as that vessel has synced.
 */
const PendingAckPage: React.FC = () => {
    const isAdmin = authService.isAdmin();
    const [searchParams, setSearchParams] = useSearchParams();
    // Every tab is shown to everyone. Office users: the API returns only your own items unless you are an
    // administrator. Settings: anyone can read them; only an administrator can change them.
    const visibleTabs: Tab[] = [...TABS];
    const role = authService.currentUser()?.role || 'none';
    const requested = (searchParams.get('tab') ?? 'mine') as Tab;
    const activeTab: Tab = visibleTabs.includes(requested) ? requested : 'mine';

    const selectTab = (index: number) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', visibleTabs[index]);
        setSearchParams(next, { replace: true });
    };

    // ---------------------------------------------------------------- My items
    const mine = useApiList<AckPendingRow>(activeTab === 'mine' ? 'Pending/Mine' : null);

    // ---------------------------------------------------------------- Vessels
    const summary = useApiList<AckVesselSummary>(activeTab === 'vessels' ? 'Pending/Vessels' : null);
    const vesselId = searchParams.get('vessel');
    const [itemType, setItemType] = useState(ALL);
    const [rank, setRank] = useState(ALL);
    const [overdueOnly, setOverdueOnly] = useState(false);
    // vessel=-1 in the address means every vessel: the API is then called without a vesselId.
    const vesselQuery = new URLSearchParams();
    if (vesselId && vesselId !== '-1') vesselQuery.set('vesselId', vesselId);
    if (itemType !== ALL) vesselQuery.set('itemType', itemType);
    const vesselEndpoint = activeTab === 'vessels' && vesselId
        ? `Pending/Vessel${vesselQuery.toString() ? `?${vesselQuery.toString()}` : ''}`
        : null;
    const vesselRows = useApiList<AckPendingRow>(vesselEndpoint);
    const shownVesselRows = useMemo(
        () => vesselRows.rows.filter((r) => (rank === ALL || r.rank === rank) && (!overdueOnly || r.overdue)),
        [vesselRows.rows, rank, overdueOnly]
    );
    const rankOptions = useMemo(() => {
        const ranks = Array.from(new Set(vesselRows.rows.map((r) => r.rank).filter((r): r is string => !!r))).sort();
        return [{ label: 'All ranks', value: ALL }, ...ranks.map((r) => ({ label: r, value: r }))];
    }, [vesselRows.rows]);
    const selectedVessel = summary.rows.find((v) => String(v.vesselID) === vesselId);

    const openVessel = (id: number | null) => {
        const next = new URLSearchParams(searchParams);
        if (id == null) next.delete('vessel');
        else next.set('vessel', String(id));
        setSearchParams(next);
        setRank(ALL);
    };

    const totals = useMemo(
        () =>
            summary.rows.reduce(
                (t, v) => ({
                    pending: t.pending + v.manualsPending + v.circularsPending + v.alertsPending,
                    overdue: t.overdue + v.manualsOverdue + v.circularsOverdue + v.alertsOverdue,
                }),
                { pending: 0, overdue: 0 }
            ),
        [summary.rows]
    );

    // ---------------------------------------------------------------- Office users (admin)
    const [officeUser, setOfficeUser] = useState(ALL);
    const office = useApiList<AckPendingRow>(activeTab === 'office' ? 'Pending/Office' : null);
    const officeUsers = useMemo(() => {
        const users = new Map<string, string>();
        office.rows.forEach((r) => r.userID && users.set(r.userID, r.userName || r.userID));
        return [{ label: 'Everyone', value: ALL },
            ...Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ label, value }))];
    }, [office.rows]);
    const [officeType, setOfficeType] = useState(ALL);
    const [officeOverdue, setOfficeOverdue] = useState(false);
    const shownOfficeRows = useMemo(
        () => office.rows.filter((r) =>
            (officeUser === ALL || r.userID === officeUser)
            && (officeType === ALL || r.itemType === officeType)
            && (!officeOverdue || r.overdue)),
        [office.rows, officeUser, officeType, officeOverdue]
    );

    // ---------------------------------------------------------------- Settings (admin)
    const [settings, setSettings] = useState<FeatureSettings | null>(null);
    const [categories, setCategories] = useState<CircularCategorySetting[]>([]);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (activeTab !== 'settings') return;
        setSettingsError(null);
        dmsLifecycleService
            .getApiCall<FeatureSettings>('Pending/Settings')
            .then(setSettings)
            .catch((err) => setSettingsError(errorMessage(err, 'The settings could not be loaded.')));
        featureApi.circular.categories().then(setCategories).catch(() => setCategories([]));
    }, [activeTab]);

    // Circular categories that need a "valid until" date: saved as soon as a box is ticked.
    const toggleCategory = async (c: CircularCategorySetting, value: boolean) => {
        try {
            await featureApi.circular.saveCategory({ ...c, requiresValidUntil: value });
            setCategories((list) => list.map((x) => (x.ciR_CategoryID === c.ciR_CategoryID ? { ...x, requiresValidUntil: value } : x)));
        } catch (err) {
            notify.error(errorMessage(err), 'Category not saved');
        }
    };

    const saveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        setSaving(true);
        try {
            await dmsLifecycleService.putApiCall('Pending/Settings', settings);
            notify.success('Settings saved.');
        } catch (err) {
            notify.error(errorMessage(err), 'Settings not saved');
        } finally {
            setSaving(false);
        }
    };

    const numberField = (key: keyof FeatureSettings, label: string, help: string, min = 0) => (
        <div className="pa-field">
            <label htmlFor={`pa-${key}`}>{label}</label>
            <input
                id={`pa-${key}`}
                type="number"
                min={min}
                className="form-control"
                value={settings ? Number(settings[key] ?? 0) : ''}
                onChange={(e) => settings && setSettings({ ...settings, [key]: Math.max(min, Number(e.target.value) || 0) })}
            />
            <small>{help}</small>
        </div>
    );

    const tabIndex = visibleTabs.indexOf(activeTab);

    return (
        <>
            <PageHeader title="Pending acknowledgements" />
            <main className="pending-page">
                <TabView activeIndex={tabIndex} onTabChange={(e) => selectTab(e.index)} className="dashboard-tabs pa-tabs">
                    <TabPanel header={<span className="pa-tab"><i className="pi pi-user" /> My items</span>}>
                        <div className="pa-section-head">
                            <div>
                                <h2>Items awaiting your acknowledgement</h2>
                                <p className="pa-intro">Manuals, circulars and alerts assigned to you.</p>
                            </div>
                            <div className="pa-summary-count" role="status">
                                <strong>{mine.loading || mine.error ? '—' : mine.rows.length}</strong>
                                <span>pending</span>
                                {!mine.loading && !mine.error && mine.rows.some((row) => row.overdue) && (
                                    <span className="pa-badge pa-badge-overdue">
                                        {mine.rows.filter((row) => row.overdue).length} overdue
                                    </span>
                                )}
                            </div>
                        </div>
                        <ErrorLine error={mine.error} />
                        <PendingTable
                            rows={mine.rows}
                            loading={mine.loading}
                            whoLabel="Role"
                            emptyMessage="Nothing is waiting for your acknowledgement."
                        />
                    </TabPanel>

                    <TabPanel header={<span className="pa-tab"><i className="pi pi-compass" /> Vessels</span>}>
                        <ErrorLine error={summary.error} />
                        {!vesselId ? (
                            <>
                                <div className="pa-overview">
                                    <div className="pa-overview-copy">
                                        <span className="pa-eyebrow">Fleet overview</span>
                                        <p className="pa-intro">Outstanding items known from each vessel's latest sync.</p>
                                    </div>
                                    <div className="pa-overview-stats" aria-live="polite">
                                        <div className="pa-stat">
                                            <span>Outstanding</span>
                                            <strong>{summary.loading || summary.error ? '—' : totals.pending}</strong>
                                        </div>
                                        <div className="pa-stat pa-stat-overdue">
                                            <span>Overdue</span>
                                            <strong>{summary.loading || summary.error ? '—' : totals.overdue}</strong>
                                        </div>
                                    </div>
                                    <div className="pa-toolbar-actions">
                                        <Button label="All vessels" icon="pi pi-list" className="p-button-sm p-button-outlined" onClick={() => openVessel(-1)} />
                                        <Button icon="pi pi-refresh" className="p-button-sm p-button-text" onClick={summary.reload} aria-label="Refresh" title="Refresh" />
                                    </div>
                                </div>
                                <div className="pa-vessels">
                                    {summary.rows.map((v) => {
                                        const pending = v.manualsPending + v.circularsPending + v.alertsPending;
                                        const overdue = v.manualsOverdue + v.circularsOverdue + v.alertsOverdue;
                                        return (
                                            <button
                                                key={v.vesselID}
                                                type="button"
                                                className={'pa-vessel' + (overdue > 0 ? ' pa-vessel-overdue' : pending === 0 ? ' pa-vessel-clear' : '')}
                                                onClick={() => openVessel(v.vesselID)}
                                            >
                                                <span className="pa-vessel-name">{v.vesselName || `Vessel ${v.vesselID}`}</span>
                                                <span className="pa-vessel-total">
                                                    {pending === 0 ? 'All acknowledged' : `${pending} pending`}
                                                </span>
                                                <span className="pa-vessel-grid">
                                                    <span>Manuals</span><Count pending={v.manualsPending} overdue={v.manualsOverdue} />
                                                    <span>Circulars</span><Count pending={v.circularsPending} overdue={v.circularsOverdue} />
                                                    <span>Alerts</span><Count pending={v.alertsPending} overdue={v.alertsOverdue} />
                                                </span>
                                                <span className="pa-sub">
                                                    Last sync: {v.lastSyncUtc ? formatDateTime(v.lastSyncUtc.endsWith('Z') ? v.lastSyncUtc : `${v.lastSyncUtc}Z`) : 'never'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {!summary.loading && summary.rows.length === 0 && !summary.error && (
                                        <p className="pa-intro">No active vessels.</p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="pa-detail-toolbar">
                                    <Button label="All vessels" icon="pi pi-arrow-left" className="p-button-sm p-button-text" onClick={() => openVessel(null)} />
                                    <div className="pa-detail-title">
                                        <h2 className="pa-heading">
                                            {vesselId === '-1' ? 'Every vessel' : selectedVessel?.vesselName || `Vessel ${vesselId}`}
                                        </h2>
                                        <span className="pa-sub">Outstanding items by crew member and rank</span>
                                    </div>
                                    <div className="pa-toolbar-actions">
                                        <Dropdown value={itemType} options={ITEM_TYPES} onChange={(e) => setItemType(e.value)} aria-label="Item type" className="pa-filter-type" />
                                        <Dropdown value={rank} options={rankOptions} onChange={(e) => setRank(e.value)} aria-label="Rank" className="pa-filter-rank" />
                                        <OverdueToggle id="pa-vessel-overdue" checked={overdueOnly} onChange={setOverdueOnly} />
                                    </div>
                                </div>
                                <ErrorLine error={vesselRows.error} />
                                <PendingTable
                                    rows={shownVesselRows}
                                    loading={vesselRows.loading}
                                    showVessel={vesselId === '-1'}
                                    emptyMessage="Every crew member has acknowledged."
                                />
                            </>
                        )}
                    </TabPanel>

                    <TabPanel header={<span className="pa-tab"><i className="pi pi-building" /> Office users</span>}>
                            <div className="pa-section-head">
                                <div>
                                    <h2>Office acknowledgements</h2>
                                    <p className="pa-intro">
                                        {isAdmin
                                            ? 'Items still awaiting acknowledgement from office users.'
                                            : 'Your own items. Only an administrator sees every office user.'}
                                    </p>
                                </div>
                                <div className="pa-summary-count" role="status">
                                    <strong>{office.loading || office.error ? '—' : shownOfficeRows.length}</strong>
                                    <span>pending</span>
                                </div>
                                <div className="pa-toolbar-actions">
                                    {isAdmin && (
                                        <Dropdown value={officeUser} options={officeUsers} onChange={(e) => setOfficeUser(e.value)}
                                            aria-label="Office user" filter={officeUsers.length > 10} />
                                    )}
                                    <Dropdown value={officeType} options={ITEM_TYPES} onChange={(e) => setOfficeType(e.value)} aria-label="Item type" />
                                    <OverdueToggle id="pa-office-overdue" checked={officeOverdue} onChange={setOfficeOverdue} />
                                </div>
                            </div>
                            <ErrorLine error={office.error} />
                            <PendingTable rows={shownOfficeRows} loading={office.loading} whoLabel="Role" emptyMessage="Every office user has acknowledged." />
                        </TabPanel>

                        <TabPanel header={<span className="pa-tab"><i className="pi pi-sliders-h" /> Settings</span>}>
                            <ErrorLine error={settingsError} />
                            {!isAdmin && (
                                <div className="pa-readonly" role="note">
                                    <i className="pi pi-lock" aria-hidden="true" />
                                    <span>
                                        Only an administrator can change these settings. Your role is <strong>{role}</strong>;
                                        an administrator has the role <strong>Admin</strong> in HQ_Users.
                                    </span>
                                </div>
                            )}
                            {settings && (
                                <form className="pa-settings" onSubmit={saveSettings}>
                                    <fieldset disabled={!isAdmin} className="pa-settings-fields">
                                    <div className="pa-settings-section">
                                        <div className="pa-settings-heading">
                                            <h3>Days to acknowledge</h3>
                                            <p>Default deadlines applied to newly released items.</p>
                                        </div>
                                        <div className="pa-settings-grid pa-settings-due-grid">
                                            {numberField('defaultAckDueDaysManual', 'Manuals', 'Days after release.')}
                                            {numberField('defaultAckDueDaysCircular', 'Circulars', 'Days after release.')}
                                            {numberField('defaultAckDueDaysAlert', 'Alerts', 'Days after release.')}
                                        </div>
                                    </div>
                                    <div className="pa-settings-section">
                                        <div className="pa-settings-heading">
                                            <h3>All-rank visibility</h3>
                                            <p>Choose which ranks can view pending items for every rank on board.</p>
                                        </div>
                                        <div className="pa-field">
                                            <label htmlFor="pa-roles">Ranks (comma separated)</label>
                                            <input
                                                id="pa-roles"
                                                className="form-control"
                                                value={settings.allowedRolesToViewAllRankPendingItems ?? ''}
                                                onChange={(e) => setSettings({ ...settings, allowedRolesToViewAllRankPendingItems: e.target.value })}
                                                placeholder="Master, Chief Engineer"
                                            />
                                        </div>
                                    </div>
                                    <div className="pa-settings-section">
                                        <div className="pa-settings-heading">
                                            <h3>Document folders</h3>
                                            <p>Set upload limits for user-managed folders.</p>
                                        </div>
                                        <div className="pa-settings-grid">
                                            {numberField('folderMaxFileSizeMB', 'Largest file (MB)', 'Per uploaded file.', 1)}
                                            {numberField('folderMaxFiles', 'Most files per folder', 'Per folder.', 1)}
                                        </div>
                                    </div>
                                    {categories.length > 0 && (
                                        <div className="pa-settings-section">
                                            <div className="pa-settings-heading">
                                                <h3>Circular categories</h3>
                                                <p>Categories whose circulars must have a "valid until" date. Saved as soon as you tick a box.</p>
                                            </div>
                                            <table className="pa-categories">
                                                <thead><tr><th>Type</th><th>Category</th><th>Valid until required</th></tr></thead>
                                                <tbody>
                                                    {categories.map((c) => (
                                                        <tr key={c.ciR_CategoryID}>
                                                            <td>{c.circularType}</td>
                                                            <td>{c.category}</td>
                                                            <td>
                                                                <Checkbox checked={!!c.requiresValidUntil} aria-label={`Valid until required for ${c.category ?? ''}`}
                                                                    disabled={!isAdmin} onChange={(e) => toggleCategory(c, !!e.checked)} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    </fieldset>
                                    {isAdmin && (
                                        <div className="pa-settings-actions">
                                            <Button type="submit" label={saving ? 'Saving…' : 'Save settings'} icon="pi pi-check" disabled={saving} />
                                        </div>
                                    )}
                                </form>
                            )}
                        </TabPanel>
                </TabView>
            </main>
        </>
    );
};

export default PendingAckPage;
