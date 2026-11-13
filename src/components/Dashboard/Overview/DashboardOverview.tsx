import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import ReportDialog from '../../Reports/ReportDialog';
import { ReportContextKey } from '../../Reports/reportCatalog';
import './DashboardOverview.scss';

/**
 * Dashboard > Overview: manuals, circulars and the fleet on one screen.
 *
 *  Three sections, each with only its own figures, lists and activity: Manuals, Circulars & Alerts, Vessels.
 *  - Counts: one tile per figure, each opens the matching list (the explanation is in the tooltip).
 *  - Waiting for you: only what the signed-in user has to do (rows with nothing in them are left out).
 *  - Manuals by status: every manual, one bar split by status; "awaiting vessel acknowledgement" is not a status, so it stands apart.
 *  - Vessel sync / Acknowledgements by vessel: from Vessel/GetSyncMonitor (the same data as the Vessel sync page).
 *  - Expiring soon: released circulars and alerts whose "valid until" date is in the next 30 days.
 *  - Recent activity: manual notifications in Manuals; circular and alert notifications in Circulars & Alerts.
 * Each block loads on its own, so one failing call leaves the others working.
 */

export interface DashboardOverviewProps {
    userId: string;
}

interface ManualCounts {
    newCnt?: number;
    toApproveCnt?: number;
    releasedCnt?: number;
    toAckCnt?: number;
    userToApproveCnt?: number;
    userToReviewCnt?: number;
    userToAckCnt?: number;
    favouriteCnt?: number;
}

interface CircularCounts {
    totalCirculars?: number;
    totalAlerts?: number;
}

interface MonitorRow {
    vesselID: number;
    vslName?: string;
    vslCode?: string;
    link: string;
    lastSuccessUtc?: string;
    lastStatus?: string;
    acksPending: number;
    alertsPending: number;
    hasKey: boolean;
}

interface MonitorData {
    syncInstalled: boolean;
    vessels: MonitorRow[];
}

interface ExpiringItem {
    id: number;
    number: string;
    title?: string;
    type: 'Circular' | 'Alert' | string;
    validUntil: string;
    daysLeft: number;
}

interface RawNotification {
    manualNotificationId?: number;
    cirNotificationId?: number;
    notificationTitle?: string;
    description?: string;
    createdDate?: string;
    isRead?: number | boolean;
    dM_ManualID?: number;
    manualName?: string;
    ciR_MasterID?: number;
    circularType?: string;
}

interface ActivityItem {
    key: string;
    kind: 'manual' | 'circular' | 'alert';
    id: number;
    title: string;
    text: string;
    when?: string;
    isRead: boolean;
    open: string;
}

type Load<T> = { data: T | null; failed: boolean };
const loading = <T,>(): Load<T> => ({ data: null, failed: false });

/** A vessel counts as behind when its last good sync is older than this. */
const BEHIND_HOURS = 24;
const LIST_ROWS = 5;

/** Server times without a zone are UTC. */
const parseUtc = (iso?: string): number => {
    if (!iso) return NaN;
    return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
};

/** Notification times are the server's local time (as the Manuals and Circulars tabs read them). */
const parseLocal = (s?: string): number => (s ? new Date(s).getTime() : NaN);

/** "Just now", "12 min ago", "5 h ago", "3 d ago" */
const ago = (time: number): string => {
    if (Number.isNaN(time)) return '';
    const mins = Math.max(0, Math.round((Date.now() - time) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const DashboardOverview: React.FC<DashboardOverviewProps> = ({ userId }) => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<ReportContextKey | null>(null);
    const [manuals, setManuals] = useState<Load<ManualCounts>>(loading);
    const [circulars, setCirculars] = useState<Load<CircularCounts>>(loading);
    const [monitor, setMonitor] = useState<Load<MonitorData>>(loading);
    const [expiring, setExpiring] = useState<Load<ExpiringItem[]>>(loading);
    const [activity, setActivity] = useState<Load<ActivityItem[]>>(loading);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        const get = <T,>(url: string, set: (v: Load<T>) => void) =>
            dmsLifecycleService.getApiCall<T>(url)
                .then((data) => set({ data, failed: false }))
                .catch(() => set({ data: null, failed: true }));

        const activityCall = Promise.allSettled([
            dmsLifecycleService.getApiCall<RawNotification[] | null>('Manuals/GetManualNotifications?limit=10'),
            dmsLifecycleService.getApiCall<RawNotification[] | null>('Circular/GetCircularsNotifications?limit=10'),
        ]).then(([m, c]) => {
            if (m.status === 'rejected' && c.status === 'rejected') {
                setActivity({ data: null, failed: true });
                return;
            }
            const items: ActivityItem[] = [];
            if (m.status === 'fulfilled') {
                (m.value ?? []).forEach((n) => items.push({
                    key: `m${n.manualNotificationId}`,
                    kind: 'manual',
                    id: n.manualNotificationId ?? 0,
                    title: n.notificationTitle || 'Manual',
                    text: n.manualName || n.description || '',
                    when: n.createdDate,
                    isRead: !!n.isRead,
                    open: n.dM_ManualID ? `/manuals?id=${n.dM_ManualID}` : '/manuals',
                }));
            }
            if (c.status === 'fulfilled') {
                (c.value ?? []).forEach((n) => {
                    const alert = (n.circularType || '').toLowerCase().startsWith('alert');
                    const mode = alert ? 'alerts' : 'circulars';
                    items.push({
                        key: `c${n.cirNotificationId}`,
                        kind: alert ? 'alert' : 'circular',
                        id: n.cirNotificationId ?? 0,
                        title: n.notificationTitle || (alert ? 'Alert' : 'Circular'),
                        text: n.description || '',
                        when: n.createdDate,
                        isRead: !!n.isRead,
                        open: n.ciR_MasterID ? `/circulars?cirmode=${mode}&id=${n.ciR_MasterID}` : `/circulars?cirmode=${mode}`,
                    });
                });
            }
            items.sort((a, b) => (parseLocal(b.when) || 0) - (parseLocal(a.when) || 0));
            setActivity({ data: items, failed: false });
        });

        await Promise.allSettled([
            get<ManualCounts>(`Manuals/GetDashboardManualCounts?userId=${encodeURIComponent(userId)}`, setManuals),
            get<CircularCounts>('Circular/GetDashboardCircularCounts', setCirculars),
            get<MonitorData>('Vessel/GetSyncMonitor', setMonitor),
            get<ExpiringItem[]>('Circular/GetExpiringSoon?days=30&limit=8', setExpiring),
            activityCall,
        ]);
        setUpdatedAt(new Date());
        setRefreshing(false);
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    // ---- figures
    const m = manuals.data ?? {};
    const drafts = m.newCnt ?? 0;
    const pending = m.toApproveCnt ?? 0;
    const released = m.releasedCnt ?? 0;
    const vesselAck = m.toAckCnt ?? 0;
    const allManuals = drafts + pending + released;
    const n = (v: number | undefined, load: Load<unknown>) => (load.data ? (v ?? 0).toLocaleString() : load.failed ? '–' : '…');

    const manualTiles = [
        { label: 'Released manuals', value: n(released, manuals), icon: 'pi pi-book', tone: 'ok', hint: 'Manuals released to the fleet', go: () => navigate('/manuals') },
        { label: 'Drafts', value: n(drafts, manuals), icon: 'pi pi-pencil', tone: 'muted', hint: 'Manuals still being prepared', go: () => navigate('/manuals?mode=new') },
        { label: 'Pending approval', value: n(pending, manuals), icon: 'pi pi-hourglass', tone: 'warn', hint: 'Manuals waiting for approval (anyone’s)', go: () => navigate('/manuals?mode=pendingapproval') },
        { label: 'Awaiting vessel ack', value: n(vesselAck, manuals), icon: 'pi pi-send', tone: 'info', hint: 'Released manuals that vessels have not acknowledged yet', go: () => navigate('/manuals?mode=vsltoack') },
    ];
    const circularTiles = [
        { label: 'Circulars', value: n(circulars.data?.totalCirculars, circulars), icon: 'pi pi-megaphone', tone: 'info', hint: 'All circulars you can see', go: () => navigate('/circulars?cirmode=circulars') },
        { label: 'Alerts', value: n(circulars.data?.totalAlerts, circulars), icon: 'pi pi-exclamation-triangle', tone: 'danger', hint: 'All alerts you can see', go: () => navigate('/circulars?cirmode=alerts') },
    ];

    const myWork = [
        { count: m.userToApproveCnt ?? 0, label: 'to approve', icon: 'pi pi-check-circle', tone: 'danger', go: () => navigate('/manuals?mode=pendingapproval') },
        { count: m.userToReviewCnt ?? 0, label: 'to review', icon: 'pi pi-eye', tone: 'warn', go: () => navigate('/manuals?mode=underreview') },
        { count: m.userToAckCnt ?? 0, label: 'to acknowledge', icon: 'pi pi-verified', tone: 'info', go: () => navigate('/manuals?mode=usertoack') },
    ];
    const myWorkOpen = myWork.filter((w) => w.count > 0);
    const myWorkTotal = myWork.reduce((s, w) => s + w.count, 0);

    const statusParts = [
        { label: 'Drafts', count: drafts, tone: 'muted', go: () => navigate('/manuals?mode=new') },
        { label: 'Pending approval', count: pending, tone: 'warn', go: () => navigate('/manuals?mode=pendingapproval') },
        { label: 'Released', count: released, tone: 'ok', go: () => navigate('/manuals') },
    ];

    // ---- fleet
    const fleet = useMemo(() => {
        const vessels = monitor.data?.vessels ?? [];
        const now = Date.now();
        const state = (v: MonitorRow) => {
            const last = parseUtc(v.lastSuccessUtc);
            if ((v.lastStatus || '').toLowerCase() === 'failed') return 'failed';
            if (v.link === 'Not connected' || Number.isNaN(last)) return 'never';
            if (now - last > BEHIND_HOURS * 3600_000) return 'behind';
            return v.link === 'Online' ? 'online' : 'offline';
        };
        const rows = vessels.map((v) => ({ ...v, state: state(v), last: parseUtc(v.lastSuccessUtc) }));
        const order: Record<string, number> = { failed: 0, behind: 1, never: 2, offline: 3, online: 4 };
        const attention = rows
            .filter((r) => r.state === 'failed' || r.state === 'behind' || r.state === 'never')
            .sort((a, b) => order[a.state] - order[b.state] || (a.last || 0) - (b.last || 0));
        const acks = rows.filter((r) => r.acksPending > 0).sort((a, b) => b.acksPending - a.acksPending);
        return {
            total: rows.length,
            online: rows.filter((r) => r.state === 'online').length,
            offline: rows.filter((r) => r.state === 'offline').length,
            attention,
            acks,
            acksTotal: acks.reduce((s, r) => s + r.acksPending, 0),
            acksMax: acks.length ? acks[0].acksPending : 0,
        };
    }, [monitor.data]);

    const stateText: Record<string, string> = {
        failed: 'Last sync failed',
        behind: `Not synced for ${BEHIND_HOURS} h+`,
        never: 'Never synced',
        offline: 'Offline',
        online: 'Online',
    };

    const manualActivity = (activity.data ?? []).filter((a) => a.kind === 'manual');
    const circularActivity = (activity.data ?? []).filter((a) => a.kind !== 'manual');

    const openActivity = (a: ActivityItem) => {
        if (!a.isRead && a.id) {
            const url = a.kind === 'manual' ? 'Manuals/MarkNotificationRead' : 'Circular/MarkNotificationRead';
            dmsLifecycleService.postApiCall(url, { notificationId: a.id }).catch(() => undefined);
        }
        navigate(a.open);
    };

    const vesselName = (v: MonitorRow) => v.vslName || v.vslCode || `Vessel ${v.vesselID}`;

    const failedText = 'Could not load this. Try Refresh.';

    return (
        <div className="dov">
            <div className="dov-bar">
                <button type="button" className="dov-chip" onClick={() => navigate('/search')}><i className="pi pi-search" />Search everything</button>
                <div className="dov-bar__meta">
                    {updatedAt && <span>Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    <button type="button" className="dov-chip" onClick={load} disabled={refreshing} aria-label="Refresh the overview">
                        <i className={`pi ${refreshing ? 'pi-spin pi-spinner' : 'pi-refresh'}`} />Refresh
                    </button>
                </div>
            </div>

            <section className="dov-section is-manuals" aria-label="Manuals">
                <header className="dov-section__head">
                    <span className="dov-section__icon"><i className="pi pi-book" aria-hidden="true" /></span>
                    <h2>Manuals</h2>
                    <span className="dov-section__sub">Company manuals and their approval</span>
                    <div className="dov-section__links">
                        <button type="button" className="dov-chip" onClick={() => navigate('/manuals')}><i className="pi pi-book" />Open manuals</button>
                        <button type="button" className="dov-chip" onClick={() => setReports('manuals')}><i className="pi pi-chart-bar" />Reports</button>
                    </div>
                </header>
                <div className="dov-tiles dov-tiles--4">
                    {manualTiles.map((t) => (
                        <button key={t.label} type="button" className={`dov-tile tone-${t.tone}`} onClick={t.go} title={t.hint}>
                            <span className="dov-tile__icon"><i className={t.icon} aria-hidden="true" /></span>
                            <span className="dov-tile__text">
                                <span className="dov-tile__value">{t.value}</span>
                                <span className="dov-tile__label">{t.label}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <div className="dov-grid">
    {/* Waiting for you */}
                    <section className="dov-panel" aria-labelledby="dov-mine">
                        <header className="dov-panel__head">
                            <h3 id="dov-mine">Waiting for you</h3>
                            {myWorkTotal > 0 && <span className="dov-count tone-danger">{myWorkTotal}</span>}
                        </header>
                        {manuals.failed ? <p className="dov-empty">{failedText}</p>
                            : !manuals.data ? <p className="dov-empty">Loading…</p>
                            : myWorkOpen.length === 0
                                ? <div className="dov-clear"><i className="pi pi-check-circle" aria-hidden="true" /><span>Nothing waiting for you</span></div>
                                : (
                                    <ul className="dov-list">
                                        {myWorkOpen.map((w) => (
                                            <li key={w.label}>
                                                <button type="button" className="dov-row" onClick={w.go}>
                                                    <span className={`dov-row__icon tone-${w.tone}`}><i className={w.icon} aria-hidden="true" /></span>
                                                    <span className="dov-row__main">
                                                        <span className="dov-row__title">{plural(w.count, 'manual')} {w.label}</span>
                                                    </span>
                                                    <i className="pi pi-angle-right dov-row__go" aria-hidden="true" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                    </section>

                    {/* Manuals by status */}
                    <section className="dov-panel" aria-labelledby="dov-status">
                        <header className="dov-panel__head">
                            <h3 id="dov-status">By status</h3>
                            {manuals.data && <span className="dov-panel__sub">{plural(allManuals, 'manual')}</span>}
                        </header>
                        {manuals.failed ? <p className="dov-empty">{failedText}</p>
                            : !manuals.data ? <p className="dov-empty">Loading…</p>
                            : (
                                <>
                                    <div className="dov-stack" role="img" aria-label={statusParts.map((p) => `${p.label} ${p.count}`).join(', ')}>
                                        {allManuals === 0
                                            ? <span className="dov-stack__none" />
                                            : statusParts.filter((p) => p.count > 0).map((p) => (
                                                <span key={p.label} className={`dov-stack__part tone-${p.tone}`} style={{ flexGrow: p.count }} title={`${p.label}: ${p.count}`} />
                                            ))}
                                    </div>
                                    <ul className="dov-legend">
                                        {statusParts.map((p) => (
                                            <li key={p.label}>
                                                <button type="button" onClick={p.go}>
                                                    <span className={`dov-dot tone-${p.tone}`} aria-hidden="true" />
                                                    <span className="dov-legend__label">{p.label}</span>
                                                    <span className="dov-legend__value">{p.count}</span>
                                                    <span className="dov-legend__pct">{allManuals ? `${Math.round((p.count / allManuals) * 100)}%` : ''}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <button type="button" className="dov-aside" onClick={() => navigate('/manuals?mode=vsltoack')}>
                                        <i className="pi pi-send" aria-hidden="true" />
                                        <span><strong>{vesselAck}</strong> released {vesselAck === 1 ? 'manual is' : 'manuals are'} awaiting vessel acknowledgement</span>
                                        <i className="pi pi-angle-right" aria-hidden="true" />
                                    </button>
                                </>
                            )}
                    </section>

                    {/* Recent manual activity */}
                    <section className="dov-panel" aria-labelledby="dov-mact">
                        <header className="dov-panel__head">
                            <h3 id="dov-mact">Recent manual activity</h3>
                            {manualActivity.some((a) => !a.isRead) && (
                                <span className="dov-panel__sub">{manualActivity.filter((a) => !a.isRead).length} new</span>
                            )}
                        </header>
                        {activity.failed ? <p className="dov-empty">{failedText}</p>
                            : !activity.data ? <p className="dov-empty">Loading…</p>
                            : manualActivity.length === 0
                                ? <div className="dov-clear"><i className="pi pi-inbox" aria-hidden="true" /><span>No recent manual activity</span></div>
                                : (
                                    <ul className="dov-list dov-list--tight">
                                        {manualActivity.slice(0, LIST_ROWS).map((a) => (
                                            <li key={a.key}>
                                                <button type="button" className={`dov-row${a.isRead ? '' : ' is-new'}`} onClick={() => openActivity(a)}>
                                                    <span className={`dov-row__icon tone-${a.kind === 'manual' ? 'ok' : a.kind === 'alert' ? 'danger' : 'info'}`}>
                                                        <i className={a.kind === 'manual' ? 'pi pi-book' : a.kind === 'alert' ? 'pi pi-exclamation-triangle' : 'pi pi-megaphone'} aria-hidden="true" />
                                                    </span>
                                                    <span className="dov-row__main">
                                                        <span className="dov-row__title">{a.title}</span>
                                                        {a.text && <span className="dov-row__sub" title={a.text}>{a.text}</span>}
                                                    </span>
                                                    <span className="dov-row__meta">{ago(parseLocal(a.when))}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                    </section>
                </div>
            </section>

            <section className="dov-section is-circulars" aria-label="Circulars & Alerts">
                <header className="dov-section__head">
                    <span className="dov-section__icon"><i className="pi pi-megaphone" aria-hidden="true" /></span>
                    <h2>Circulars & Alerts</h2>
                    <span className="dov-section__sub">Notices sent to the fleet</span>
                    <div className="dov-section__links">
                        <button type="button" className="dov-chip" onClick={() => navigate('/circulars?cirmode=circulars')}><i className="pi pi-megaphone" />Open circulars</button>
                        <button type="button" className="dov-chip" onClick={() => navigate('/circulars?cirmode=alerts')}><i className="pi pi-exclamation-triangle" />Open alerts</button>
                        <button type="button" className="dov-chip" onClick={() => setReports('circulars')}><i className="pi pi-chart-bar" />Circular reports</button>
                        <button type="button" className="dov-chip" onClick={() => setReports('alerts')}><i className="pi pi-chart-bar" />Alert reports</button>
                    </div>
                </header>
                <div className="dov-tiles dov-tiles--2">
                    {circularTiles.map((t) => (
                        <button key={t.label} type="button" className={`dov-tile tone-${t.tone}`} onClick={t.go} title={t.hint}>
                            <span className="dov-tile__icon"><i className={t.icon} aria-hidden="true" /></span>
                            <span className="dov-tile__text">
                                <span className="dov-tile__value">{t.value}</span>
                                <span className="dov-tile__label">{t.label}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <div className="dov-grid dov-grid--2">
    {/* Expiring soon */}
                    <section className="dov-panel" aria-labelledby="dov-exp">
                        <header className="dov-panel__head">
                            <h3 id="dov-exp">Expiring in the next 30 days</h3>
                        </header>
                        {expiring.failed ? <p className="dov-empty">{failedText}</p>
                            : !expiring.data ? <p className="dov-empty">Loading…</p>
                            : expiring.data.length === 0
                                ? <div className="dov-clear"><i className="pi pi-calendar" aria-hidden="true" /><span>No circulars or alerts expire in the next 30 days</span></div>
                                : (
                                    <ul className="dov-list dov-list--tight">
                                        {expiring.data.slice(0, LIST_ROWS).map((e) => {
                                            const mode = e.type === 'Alert' ? 'alerts' : 'circulars';
                                            return (
                                                <li key={e.id}>
                                                    <button type="button" className="dov-row" onClick={() => navigate(`/circulars?cirmode=${mode}&id=${e.id}`)}>
                                                        <span className={`dov-row__icon tone-${e.type === 'Alert' ? 'danger' : 'info'}`}>
                                                            <i className={e.type === 'Alert' ? 'pi pi-exclamation-triangle' : 'pi pi-megaphone'} aria-hidden="true" />
                                                        </span>
                                                        <span className="dov-row__main">
                                                            <span className="dov-row__title" title={e.title}><span className={`dov-kind tone-${e.type === 'Alert' ? 'danger' : 'info'}`}>{e.type === 'Alert' ? 'Alert' : 'Circular'}</span>{e.title || e.number}</span>
                                                            <span className="dov-row__sub">{e.number}</span>
                                                        </span>
                                                        <span className={`dov-due ${e.daysLeft <= 7 ? 'tone-danger' : 'tone-warn'}`}
                                                            title={`Valid until ${new Date(e.validUntil).toLocaleDateString()}`}>
                                                            {e.daysLeft <= 0 ? 'Today' : e.daysLeft === 1 ? 'Tomorrow' : `${e.daysLeft} days`}
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                    </section>

                    {/* Recent circular & alert activity */}
                    <section className="dov-panel" aria-labelledby="dov-cact">
                        <header className="dov-panel__head">
                            <h3 id="dov-cact">Recent circular & alert activity</h3>
                            {circularActivity.some((a) => !a.isRead) && (
                                <span className="dov-panel__sub">{circularActivity.filter((a) => !a.isRead).length} new</span>
                            )}
                        </header>
                        {activity.failed ? <p className="dov-empty">{failedText}</p>
                            : !activity.data ? <p className="dov-empty">Loading…</p>
                            : circularActivity.length === 0
                                ? <div className="dov-clear"><i className="pi pi-inbox" aria-hidden="true" /><span>No recent circular or alert activity</span></div>
                                : (
                                    <ul className="dov-list dov-list--tight">
                                        {circularActivity.slice(0, LIST_ROWS).map((a) => (
                                            <li key={a.key}>
                                                <button type="button" className={`dov-row${a.isRead ? '' : ' is-new'}`} onClick={() => openActivity(a)}>
                                                    <span className={`dov-row__icon tone-${a.kind === 'manual' ? 'ok' : a.kind === 'alert' ? 'danger' : 'info'}`}>
                                                        <i className={a.kind === 'manual' ? 'pi pi-book' : a.kind === 'alert' ? 'pi pi-exclamation-triangle' : 'pi pi-megaphone'} aria-hidden="true" />
                                                    </span>
                                                    <span className="dov-row__main">
                                                        <span className="dov-row__title"><span className={`dov-kind tone-${a.kind === 'alert' ? 'danger' : 'info'}`}>{a.kind === 'alert' ? 'Alert' : 'Circular'}</span>{a.title}</span>
                                                        {a.text && <span className="dov-row__sub" title={a.text}>{a.text}</span>}
                                                    </span>
                                                    <span className="dov-row__meta">{ago(parseLocal(a.when))}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                    </section>
                </div>
            </section>

            <section className="dov-section is-fleet" aria-label="Vessels">
                <header className="dov-section__head">
                    <span className="dov-section__icon"><i className="pi pi-compass" aria-hidden="true" /></span>
                    <h2>Vessels</h2>
                    <span className="dov-section__sub">Sync and acknowledgements from the ships</span>
                    <div className="dov-section__links">
                        <button type="button" className="dov-chip" onClick={() => navigate('/vessel-sync')}><i className="pi pi-sync" />Vessel sync</button>
                        <button type="button" className="dov-chip" onClick={() => navigate('/pending?tab=vessels')}><i className="pi pi-clock" />Pending acks</button>
                    </div>
                </header>
                <div className="dov-grid dov-grid--2">
    {/* Vessel sync */}
                    <section className="dov-panel" aria-labelledby="dov-sync">
                        <header className="dov-panel__head">
                            <h3 id="dov-sync">Vessel sync</h3>
                            </header>
                        {monitor.failed ? <p className="dov-empty">{failedText}</p>
                            : !monitor.data ? <p className="dov-empty">Loading…</p>
                            : !monitor.data.syncInstalled ? <p className="dov-empty">Vessel sync is not set up on this server yet.</p>
                            : (
                                <>
                                    <div className="dov-pills">
                                        <span className="dov-pill tone-ok"><strong>{fleet.online}</strong> online</span>
                                        <span className="dov-pill tone-muted"><strong>{fleet.offline}</strong> offline</span>
                                        <span className={`dov-pill ${fleet.attention.length ? 'tone-danger' : 'tone-muted'}`}><strong>{fleet.attention.length}</strong> need attention</span>
                                        <span className="dov-pills__total">of {plural(fleet.total, 'vessel')}</span>
                                    </div>
                                    {fleet.attention.length === 0
                                        ? <div className="dov-clear"><i className="pi pi-check-circle" aria-hidden="true" /><span>Every vessel synced in the last {BEHIND_HOURS} hours</span></div>
                                        : (
                                            <ul className="dov-list dov-list--tight">
                                                {fleet.attention.slice(0, LIST_ROWS - 1).map((v) => (
                                                    <li key={v.vesselID}>
                                                        <button type="button" className="dov-row" onClick={() => navigate('/vessel-sync')}>
                                                            <span className={`dov-dot tone-${v.state === 'failed' ? 'danger' : 'warn'}`} aria-hidden="true" />
                                                            <span className="dov-row__main">
                                                                <span className="dov-row__title">{vesselName(v)}</span>
                                                                <span className="dov-row__sub">{stateText[v.state]}</span>
                                                            </span>
                                                            <span className="dov-row__meta">{Number.isNaN(v.last) ? 'Never' : ago(v.last)}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                                {fleet.attention.length > LIST_ROWS - 1 && (
                                                    <li className="dov-more">and {fleet.attention.length - (LIST_ROWS - 1)} more</li>
                                                )}
                                            </ul>
                                        )}
                                </>
                            )}
                    </section>

                    {/* Acknowledgements by vessel */}
                    <section className="dov-panel" aria-labelledby="dov-acks">
                        <header className="dov-panel__head">
                            <h3 id="dov-acks">Acknowledgements outstanding by vessel</h3>
                            </header>
                        {monitor.failed ? <p className="dov-empty">{failedText}</p>
                            : !monitor.data ? <p className="dov-empty">Loading…</p>
                            : fleet.acks.length === 0
                                ? <div className="dov-clear"><i className="pi pi-check-circle" aria-hidden="true" /><span>Every vessel has acknowledged everything</span></div>
                                : (
                                    <>
                                        <p className="dov-panel__lead">{plural(fleet.acksTotal, 'item')} across {plural(fleet.acks.length, 'vessel')}</p>
                                        <ul className="dov-bars">
                                            {fleet.acks.slice(0, LIST_ROWS).map((v) => (
                                                <li key={v.vesselID}>
                                                    <button type="button" onClick={() => navigate('/pending?tab=vessels')}
                                                        title={`${vesselName(v)}: ${plural(v.acksPending, 'item')} to acknowledge${v.alertsPending ? `, ${plural(v.alertsPending, 'alert')}` : ''}`}>
                                                        <span className="dov-bars__name">{vesselName(v)}</span>
                                                        <span className="dov-bars__track">
                                                            <span className="dov-bars__fill" style={{ width: `${Math.max(4, (v.acksPending / fleet.acksMax) * 100)}%` }} />
                                                        </span>
                                                        <span className="dov-bars__value">
                                                            {v.acksPending}
                                                            {v.alertsPending > 0 && <span className="dov-bars__alerts" title={plural(v.alertsPending, 'alert')}><i className="pi pi-exclamation-triangle" aria-hidden="true" />{v.alertsPending}</span>}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        {fleet.acks.length > LIST_ROWS && <p className="dov-more">and {fleet.acks.length - LIST_ROWS} more vessels</p>}
                                    </>
                                )}
                    </section>

                                </div>
            </section>

            <ReportDialog context={reports} onHide={() => setReports(null)} />
        </div>
    );
};

export default DashboardOverview;
