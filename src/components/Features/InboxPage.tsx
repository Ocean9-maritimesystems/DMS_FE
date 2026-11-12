import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import PageHeader from '../PageHeader';
import featureApi, { InboxItem, ITEM_ICONS } from '../../services/featureApi';
import { errorMessage } from '../../services/DMSLifecycleService';
import notify from '../../services/notify';
import { formatDateTime } from '../utils/formatDate';
import { notifyInboxChanged } from './useInboxCount';
import InboxPreview from './InboxPreview';
import './Features.scss';

const TYPE_OPTIONS = [
    { label: 'All types', value: null },
    { label: 'Manuals', value: 'Manual' },
    { label: 'Circulars', value: 'Circular' },
    { label: 'Alerts', value: 'Alert' },
    { label: 'Documents', value: 'Document' },
    { label: 'Suggestions', value: 'Suggestion' },
];

const ACTION_TEXT: Record<string, string> = {
    New: 'New',
    Updated: 'New version',
    Cancelled: 'Cancelled',
    Expiring: 'Expiring soon',
    Expired: 'Expired',
    UnderReview: 'Under review',
    NeedsInfo: 'Needs info',
};

const actionClass = (action: string) =>
    action === 'Cancelled' || action === 'Expired' || action === 'Rejected' ? 'bad'
        : action === 'Expiring' || action === 'NeedsInfo' ? 'warn'
        : action === 'New' || action === 'Submitted' ? 'new' : 'info';

const TYPE_TEXT: Record<string, string> = { Document: 'Other document' };

/** Today: the time; this year: day and month; older: the full date. */
const shortDate = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const where = (vesselId: number) => (vesselId === -1 ? 'All vessels' : vesselId === -2 ? 'Office only' : vesselId > 0 ? `Vessel ${vesselId}` : null);

/** Feature 2: new and changed items, like an e-mail inbox. The right pane shows the item itself, read only. */
const InboxPage: React.FC = () => {
    const [items, setItems] = useState<InboxItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [show, setShow] = useState<'all' | 'unread'>('unread');
    const [itemType, setItemType] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<InboxItem | null>(null);
    const [unreadTotal, setUnreadTotal] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [list, count] = await Promise.all([
                featureApi.inbox.list(show === 'unread', itemType, search.trim() || null),
                featureApi.inbox.unreadCount().catch(() => 0),
            ]);
            setItems(list);
            setUnreadTotal(count);
        } catch (err) {
            notify.error(errorMessage(err), 'Could not load the inbox');
        } finally {
            setLoading(false);
        }
    }, [show, itemType, search]);

    useEffect(() => {
        const t = window.setTimeout(load, 250);
        return () => window.clearTimeout(t);
    }, [load]);

    /** Opening an item marks it read (in the "Unread" view it stays in the list until the next refresh). */
    const open = async (item: InboxItem) => {
        setSelected(item);
        if (item.isRead) return;
        try {
            await featureApi.inbox.markRead(item.dmS_InboxID, true);
            setItems((list) => list.map((i) => (i.dmS_InboxID === item.dmS_InboxID ? { ...i, isRead: true } : i)));
            setUnreadTotal((n) => Math.max(0, n - 1));
            notifyInboxChanged();
        } catch {
            /* reading still works; the mark is tried again next time */
        }
    };

    const markAll = async () => {
        try {
            await featureApi.inbox.markAllRead();
            notifyInboxChanged();
            await load();
        } catch (err) {
            notify.error(errorMessage(err));
        }
    };

    const visibleUnread = useMemo(() => items.filter((i) => !i.isRead).length, [items]);

    return (
        <div className="feature-page inbox-page">
            <PageHeader title="Inbox" subContent={unreadTotal ? `${unreadTotal} unread` : 'All read'} />
            <main className="feature-main">
                <div className="inbox-toolbar">
                    <div className="inbox-seg" role="group" aria-label="Show">
                        <button type="button" className={show === 'unread' ? 'active' : ''} aria-pressed={show === 'unread'} onClick={() => setShow('unread')}>
                            Unread{unreadTotal > 0 && <span className="inbox-seg-count">{unreadTotal}</span>}
                        </button>
                        <button type="button" className={show === 'all' ? 'active' : ''} aria-pressed={show === 'all'} onClick={() => setShow('all')}>
                            All
                        </button>
                    </div>
                    <Dropdown className="inbox-type" value={itemType} options={TYPE_OPTIONS} onChange={(e) => setItemType(e.value)} placeholder="All types" />
                    <span className="inbox-search">
                        <i className="pi pi-search" aria-hidden="true" />
                        <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles" aria-label="Search titles" />
                    </span>
                    <span className="spacer" />
                    <Button className="inbox-tool-btn" label="Mark all as read" icon="pi pi-check-square" text onClick={markAll} disabled={unreadTotal === 0} />
                    <Button className="inbox-tool-btn" icon="pi pi-refresh" text aria-label="Refresh" tooltip="Refresh" tooltipOptions={{ position: 'bottom' }} onClick={load} />
                </div>

                <div className="inbox-layout">
                    <div className="inbox-list" aria-busy={loading}>
                        <div className="inbox-list-head">
                            <span>{show === 'unread' ? 'Unread' : 'All items'}</span>
                            <span>{items.length}{show === 'all' && visibleUnread > 0 ? ` · ${visibleUnread} unread` : ''}</span>
                        </div>
                        {!loading && items.length === 0 && (
                            <div className="inbox-empty">
                                <span className="inbox-empty-icon"><i className="pi pi-inbox" /></span>
                                <strong>{show === 'unread' ? 'You are up to date' : 'No items'}</strong>
                                <span>{show === 'unread' ? 'Nothing new to read.' : 'Nothing matches these filters.'}</span>
                            </div>
                        )}
                        {items.map((item) => {
                            const isSel = selected?.dmS_InboxID === item.dmS_InboxID;
                            return (
                                <div
                                    key={item.dmS_InboxID}
                                    className={`inbox-row${item.isRead ? '' : ' unread'}${isSel ? ' selected' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-current={isSel ? 'true' : undefined}
                                    onClick={() => open(item)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(item); } }}
                                >
                                    <span className={`inbox-icon type-${item.itemType.toLowerCase()}`}><i className={ITEM_ICONS[item.itemType] ?? 'pi pi-file'} /></span>
                                    <div className="inbox-row-main">
                                        <div className="inbox-row-top">
                                            <span className="inbox-type">{TYPE_TEXT[item.itemType] ?? item.itemType}</span>
                                            <span className="inbox-date" title={formatDateTime(item.createdOn)}>{shortDate(item.createdOn)}</span>
                                        </div>
                                        <div className="inbox-title">{item.title || `${item.itemType} ${item.itemID}`}</div>
                                        <div className="inbox-meta">
                                            <span className={`feature-tag ${actionClass(item.action)}`}>{ACTION_TEXT[item.action] ?? item.action}</span>
                                            {!item.isRead && <span className="unread-dot" aria-label="Unread" />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <article className="inbox-reader">
                        {!selected ? (
                            <div className="inbox-empty">
                                <span className="inbox-empty-icon"><i className="pi pi-envelope" /></span>
                                <strong>Select an item to read it</strong>
                                <span>Manuals, circulars, alerts, documents and suggestions open here.</span>
                            </div>
                        ) : (
                            <>
                                <header className="inbox-reader-head">
                                    <span className={`inbox-icon large type-${selected.itemType.toLowerCase()}`}><i className={ITEM_ICONS[selected.itemType] ?? 'pi pi-file'} /></span>
                                    <div className="inbox-reader-titles">
                                        <div className="inbox-reader-kicker">
                                            <span>{TYPE_TEXT[selected.itemType] ?? selected.itemType}</span>
                                            <span className={`feature-tag ${actionClass(selected.action)}`}>{ACTION_TEXT[selected.action] ?? selected.action}</span>
                                        </div>
                                        <h2>{selected.title || `${selected.itemType} ${selected.itemID}`}</h2>
                                        <div className="reader-meta">
                                            <span><i className="pi pi-clock" /> {formatDateTime(selected.createdOn)}</span>
                                            {where(selected.vesselID) && <span><i className="pi pi-flag" /> {where(selected.vesselID)}</span>}
                                        </div>
                                    </div>
                                </header>
                                <div className="inbox-reader-body">
                                    <InboxPreview key={`${selected.itemType}-${selected.itemID}`} item={selected} />
                                </div>
                            </>
                        )}
                    </article>
                </div>
            </main>
        </div>
    );
};

export default InboxPage;
