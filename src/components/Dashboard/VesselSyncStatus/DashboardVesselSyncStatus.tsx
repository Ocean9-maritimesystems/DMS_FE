import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import dmsLifecycleService, { errorMessage } from '../../../services/DMSLifecycleService';
import VesselSyncDetails from './VesselSyncDetails';
import './DashboardVesselSyncStatus.scss';

/**
 * Sync monitor (Dashboard > Vessel Sync Status).
 * One row per vessel: link state, time since last sync, what is waiting to go out, and alerts
 * the vessel has not acknowledged. Data: GET api/Vessel/GetSyncMonitor.
 * Link state and what each ship reports come from dbo.Sync_Vessel (Database/005_VesselSync.sql);
 * until that script is run every vessel shows "Not connected".
 */
interface MonitorRow {
    vesselID: number;
    vslCode?: string;
    vslName?: string;
    vslType?: string;
    vslEmail?: string;
    link: 'Online' | 'Offline' | 'Not connected' | string;
    lastContactUtc?: string;
    lastSuccessUtc?: string;
    lastStatus?: string;
    lastError?: string;
    itemsQueued: number;
    /** Changes of any synced record waiting for the vessel's next sync. */
    changesWaiting?: number;
    itemsTotal: number;
    alertsPending: number;
    acksPending: number;
    /** Acknowledgements made on board, not yet sent to the office (reported by the ship). */
    pendingOnShip: number;
    /** What the ship reports it is doing, e.g. "Downloading alert files (2 of 5)". */
    currentActivity?: string | null;
    progressPercent?: number | null;
    appVersion?: string | null;
    hasKey: boolean;
}

interface MonitorData {
    syncInstalled: boolean;
    onlineMinutes: number;
    vessels: MonitorRow[];
}

const REFRESH_MS = 60_000;

/** "12 min", "1 h", "3 d 2 h" */
const sinceText = (iso?: string): string => {
    if (!iso) return 'Never';
    const t = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime();
    if (Number.isNaN(t)) return '—';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h`;
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest ? `${days} d ${rest} h` : `${days} d`;
};

const fullTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

/** Bar and caption for the "Pending package" column. */
const packageState = (row: MonitorRow, syncInstalled: boolean) => {
    const queued = row.itemsQueued || 0;
    const changes = row.changesWaiting || 0;
    const queuedText = queued > 0
        ? `${queued} item${queued === 1 ? '' : 's'} queued`
        : changes > 0 ? `${changes} change${changes === 1 ? '' : 's'} queued` : '0 queued';
    if (syncInstalled && !row.hasKey) {
        return { tone: 'idle', percent: 0, caption: `No sync key yet · ${row.itemsTotal} items` };
    }
    if ((row.lastStatus || '').toLowerCase() === 'failed') {
        return { tone: 'failed', percent: 100, caption: `Last sync failed · ${queuedText}` };
    }
    if (row.link === 'Not connected') {
        return { tone: 'idle', percent: 0, caption: `No sync yet · ${row.itemsTotal} items` };
    }
    if (row.link === 'Offline') {
        return { tone: 'idle', percent: 0, caption: `Waiting for link · ${queuedText}` };
    }
    // The ship reports progress while it is receiving updates or downloading files.
    if (row.currentActivity) {
        const percent = row.progressPercent ?? Math.round(((row.itemsTotal - queued) / Math.max(row.itemsTotal, 1)) * 100);
        return { tone: 'busy', percent: Math.min(Math.max(percent, 4), 100), caption: `${row.currentActivity} · ${queuedText}` };
    }
    if (queued === 0 && changes === 0) {
        return { tone: 'done', percent: 100, caption: 'Up to date · nothing queued' };
    }
    const total = Math.max(row.itemsTotal, queued);
    const percent = Math.round(((total - queued) / total) * 100);
    return { tone: 'busy', percent: Math.max(percent, 4), caption: `Goes on next sync · ${queuedText}` };
};

const DashboardVesselSyncStatus: React.FC = () => {
    const [data, setData] = useState<MonitorData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [detailsVessel, setDetailsVessel] = useState<MonitorRow | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result: MonitorData = await dmsLifecycleService.getApiCall('Vessel/GetSyncMonitor');
            setData({
                syncInstalled: Boolean(result?.syncInstalled),
                onlineMinutes: result?.onlineMinutes ?? 30,
                vessels: result?.vessels || []
            });
            setError('');
            setUpdatedAt(new Date());
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const timer = window.setInterval(load, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [load]);

    const vessels = useMemo(() => data?.vessels ?? [], [data]);

    const totals = useMemo(() => ({
        online: vessels.filter(v => v.link === 'Online').length,
        offline: vessels.filter(v => v.link === 'Offline').length,
        alerts: vessels.reduce((n, v) => n + (v.alertsPending || 0), 0),
        acks: vessels.reduce((n, v) => n + (v.acksPending || 0), 0),
        fromShips: vessels.reduce((n, v) => n + (v.pendingOnShip || 0), 0),
    }), [vessels]);

    const offlineVessels = vessels.filter(v => v.link === 'Offline');
    const offlineEmails = offlineVessels.map(v => v.vslEmail).filter(Boolean) as string[];

    const contactOffline = () => {
        const names = offlineVessels.map(v => `- ${v.vslName}${v.lastContactUtc ? ` (last contact ${sinceText(v.lastContactUtc)} ago)` : ''}`).join('\n');
        const subject = 'DMS sync: please reconnect';
        const body = `Dear Master,\n\nOur records show your vessel has not synced with the office recently. ` +
            `Please check the DMS sync connection when the link is available.\n\n${names}\n\nThank you.`;
        window.location.href = `mailto:?bcc=${encodeURIComponent(offlineEmails.join(','))}` +
            `&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const linkCell = (row: MonitorRow) => {
        const cls = row.link === 'Online' ? 'online' : row.link === 'Offline' ? 'offline' : 'unknown';
        return (
            <span className={`sm-link ${cls}`} title={row.lastContactUtc ? `Last contact ${fullTime(row.lastContactUtc)}` : 'No contact recorded'}>
                <span className="sm-dot" />{row.link}
            </span>
        );
    };

    const priorityCell = (row: MonitorRow) => {
        const n = row.alertsPending || 0;
        if (!n) return <span className="sm-muted">None</span>;
        return <span className={`sm-pill ${n > 1 ? 'high' : 'medium'}`}>{n} alert{n > 1 ? 's' : ''}</span>;
    };

    return (
        <div className="sync-monitor">
            <div className="sm-head">
                <div>
                    <div className="sm-crumb">Shore office <span>/</span></div>
                    <h2>Sync monitor</h2>
                </div>
                <div className="sm-head-actions">
                    {updatedAt && <span className="sm-muted">Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    <Button
                        type="button"
                        label="Refresh"
                        icon={loading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'}
                        className="p-button-outlined sm-refresh"
                        onClick={load}
                        disabled={loading}
                    />
                </div>
            </div>

            {data && !data.syncInstalled && (
                <div className="sm-notice">
                    <i className="pi pi-info-circle" />
                    Link status is not available yet: run <code>Database/005_VesselSync.sql</code> on the office database,
                    then generate a sync key for each vessel (list icon). Until then vessels show as “Not connected”;
                    alerts and acknowledgements below are counted from the documents sent to each vessel.
                </div>
            )}
            {error && (
                <div className="sm-notice error"><i className="pi pi-exclamation-triangle" /> Could not load the sync monitor: {error}</div>
            )}

            <div className="sm-tiles">
                <div className="sm-tile">
                    <span>Online</span>
                    <strong className="good">{data?.syncInstalled ? totals.online : '—'}</strong>
                </div>
                <div className="sm-tile">
                    <span>Offline</span>
                    <strong className="bad">{data?.syncInstalled ? totals.offline : '—'}</strong>
                </div>
                <div className="sm-tile">
                    <span>Safety alerts waiting</span>
                    <strong className="warn">{totals.alerts}</strong>
                </div>
                <div className="sm-tile">
                    <span>Awaiting acknowledgement</span>
                    <strong>{totals.acks}</strong>
                </div>
                <div className="sm-tile" title="Acknowledgements and other records made on board that the ships have not sent to the office yet">
                    <span>Waiting on ships</span>
                    <strong>{data?.syncInstalled ? totals.fromShips : '—'}</strong>
                </div>
            </div>

            <div className="sm-table-wrap">
                <table className="sm-table">
                    <thead>
                        <tr>
                            <th>Vessel</th>
                            <th>Link</th>
                            <th>Last sync</th>
                            <th>Pending package</th>
                            <th>Priority</th>
                            <th aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !data && (
                            <tr><td colSpan={6} className="sm-empty"><i className="pi pi-spin pi-spinner" /> Loading vessels…</td></tr>
                        )}
                        {data && vessels.length === 0 && (
                            <tr><td colSpan={6} className="sm-empty">No vessels found.</td></tr>
                        )}
                        {vessels.map((row) => {
                            const pkg = packageState(row, Boolean(data?.syncInstalled));
                            return (
                                <tr key={row.vesselID}>
                                    <td>
                                        <div className="sm-vessel">{row.vslName}</div>
                                        <div className="sm-sub">{[row.vslCode, row.vslType].filter(Boolean).join(' · ')}</div>
                                    </td>
                                    <td>{linkCell(row)}</td>
                                    <td title={[fullTime(row.lastSuccessUtc), row.appVersion && `App ${row.appVersion}`].filter(Boolean).join(' · ')}>
                                        {sinceText(row.lastSuccessUtc)}
                                    </td>
                                    <td>
                                        <div className={`sm-bar ${pkg.tone}`} title={row.lastError || ''}>
                                            <span style={{ width: `${pkg.percent}%` }} />
                                        </div>
                                        <div className="sm-sub">
                                            {pkg.caption}
                                            {row.pendingOnShip > 0 && <> · {row.pendingOnShip} waiting on board</>}
                                        </div>
                                    </td>
                                    <td>{priorityCell(row)}</td>
                                    <td className="sm-actions">
                                        <Button
                                            type="button"
                                            icon="pi pi-list"
                                            className="p-button-text p-button-rounded"
                                            onClick={() => setDetailsVessel(row)}
                                            tooltip="Synced items, history and sync key"
                                            tooltipOptions={{ position: 'left' }}
                                            aria-label={`View what has been synced to ${row.vslName}`}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="sm-foot">
                <Button
                    type="button"
                    label="Contact offline vessels"
                    icon="pi pi-envelope"
                    className="p-button-outlined sm-contact"
                    onClick={contactOffline}
                    disabled={offlineVessels.length === 0}
                    tooltip={offlineVessels.length === 0 ? 'No vessels are offline' : offlineEmails.length === 0 ? 'No vessel e-mail addresses on file' : undefined}
                    tooltipOptions={{ position: 'top', showOnDisabled: true }}
                />
                {data?.syncInstalled && (
                    <span className="sm-muted">Online = heard from in the last {data.onlineMinutes} minutes (ships check in every 15 minutes between syncs).</span>
                )}
            </div>

            <VesselSyncDetails
                visible={!!detailsVessel}
                vesselId={detailsVessel?.vesselID ?? 0}
                vesselName={detailsVessel?.vslName ?? ''}
                onHide={() => setDetailsVessel(null)}
                onChanged={load}
            />
        </div>
    );
};

export default DashboardVesselSyncStatus;
