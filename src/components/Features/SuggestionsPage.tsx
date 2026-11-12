import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import PageHeader from '../PageHeader';
import featureApi, { formatSize, openApiFile, SuggestionDetail, SuggestionListItem, VesselOption } from '../../services/featureApi';
import { errorMessage } from '../../services/DMSLifecycleService';
import notify from '../../services/notify';
import { formatDate, formatDateTime } from '../utils/formatDate';
import './Features.scss';
import './Suggestions.scss';

const STATUS_LABEL: Record<string, string> = {
    Submitted: 'Submitted',
    UnderReview: 'Under review',
    NeedsInfo: 'Needs information',
    Accepted: 'Accepted',
    Rejected: 'Rejected',
    Implemented: 'Implemented',
    Closed: 'Closed',
};

/** Statuses after which a suggestion is no longer "open" (same as SuggestionService.ClosedStatuses). */
const CLOSED = ['Rejected', 'Implemented', 'Closed'];

/** The moves the office may make from each status (same as SuggestionService.Moves). */
const MOVES: Record<string, string[]> = {
    Submitted: ['UnderReview', 'NeedsInfo', 'Accepted', 'Rejected'],
    UnderReview: ['NeedsInfo', 'Accepted', 'Rejected'],
    NeedsInfo: ['UnderReview', 'Accepted', 'Rejected'],
    Accepted: ['Implemented', 'Rejected', 'Closed'],
    Rejected: ['UnderReview', 'Closed'],
    Implemented: ['Closed'],
    Closed: ['UnderReview'],
};

/** What a suggestion is about. "General" is a real value here (a null value showed an empty box); it is sent as none. */
const GENERAL = 'General';
const ITEM_TYPES = [
    { label: 'General', value: GENERAL },
    { label: 'Manual', value: 'Manual' },
    { label: 'Circular', value: 'Circular' },
    { label: 'Alert', value: 'Alert' },
    { label: 'Document', value: 'Document' },
];

const PRIORITIES = ['Low', 'Medium', 'High'];

export const StatusTag: React.FC<{ status: string }> = ({ status }) => (
    <span className={`feature-tag ${status.toLowerCase()}`}>{STATUS_LABEL[status] ?? status}</span>
);

const PriorityLabel: React.FC<{ priority: string }> = ({ priority }) => (
    <span className={`sug-priority sug-priority--${(priority || 'medium').toLowerCase()}`}>
        <span className="sug-priority__dot" aria-hidden="true" />{priority || 'Medium'}
    </span>
);

/** The status tabs: open (not finished), each status, everything. */
type Tab = 'Open' | 'All' | keyof typeof STATUS_LABEL;
const inTab = (r: SuggestionListItem, tab: Tab) =>
    tab === 'All' ? true : tab === 'Open' ? !CLOSED.includes(r.status) : r.status === tab;

/** Feature 4: suggestions from the vessels and the office, and the office's decisions on them. */
const SuggestionsPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [rows, setRows] = useState<SuggestionListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('Open');
    const [search, setSearch] = useState('');
    const [vesselId, setVesselId] = useState<number | null>(null);
    const [vessels, setVessels] = useState<VesselOption[]>([]);
    const [detail, setDetail] = useState<SuggestionDetail | null>(null);
    const [showNew, setShowNew] = useState(false);

    // Every status is loaded once (for the counts on the tabs); the tab and the search filter in the browser.
    const load = useCallback(async () => {
        setLoading(true);
        try {
            setRows(await featureApi.suggestions.list(null, vesselId));
        } catch (err) {
            notify.error(errorMessage(err), 'Could not load suggestions');
        } finally {
            setLoading(false);
        }
    }, [vesselId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { featureApi.vessels().then(setVessels).catch(() => setVessels([])); }, []);

    const openDetail = useCallback(async (id: number) => {
        try {
            setDetail(await featureApi.suggestions.get(id));
        } catch (err) {
            notify.error(errorMessage(err), 'Could not open the suggestion');
        }
    }, []);

    // Deep link from the inbox or search: /suggestions?id=123
    const linkedId = searchParams.get('id');
    useEffect(() => {
        if (linkedId) openDetail(Number(linkedId));
    }, [linkedId, openDetail]);

    const closeDetail = () => {
        setDetail(null);
        if (linkedId) setSearchParams({});
    };

    const tabs = useMemo(() => {
        const count = (t: Tab) => rows.filter((r) => inTab(r, t)).length;
        const list: { key: Tab; label: string; count: number }[] = [{ key: 'Open', label: 'Open', count: count('Open') }];
        Object.entries(STATUS_LABEL).forEach(([key, label]) => {
            const n = count(key as Tab);
            if (n > 0 || tab === key) list.push({ key: key as Tab, label, count: n });   // empty statuses are left out
        });
        list.push({ key: 'All', label: 'All', count: rows.length });
        return list;
    }, [rows, tab]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows
            .filter((r) => inTab(r, tab))
            .filter((r) => !q || [r.suggestionNo, r.title, r.itemTitle, r.submittedByName, r.submittedBy, r.submittedRank, r.vesselName]
                .some((v) => (v ?? '').toLowerCase().includes(q)));
    }, [rows, tab, search]);

    const vesselOptions = [{ vesselID: null, vslName: 'All vessels and office' }, { vesselID: -2, vslName: 'Office' }, ...vessels];

    return (
        <div className="feature-page">
            <PageHeader title="Suggestions" />
            <main className="feature-main sug-page">
                <div className="sug-bar">
                    <div className="sug-tabs" role="tablist" aria-label="Status">
                        {tabs.map((t) => (
                            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                                className={`sug-tab${tab === t.key ? ' sug-tab--on' : ''}`} onClick={() => setTab(t.key)}>
                                {t.label}<span className="sug-tab__count">{t.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="sug-tools">
                        <span className="sug-search">
                            <i className="pi pi-search" aria-hidden="true" />
                            <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, title or person"
                                aria-label="Search suggestions" />
                        </span>
                        <Dropdown className="sug-vessel" value={vesselId} options={vesselOptions} optionLabel="vslName" optionValue="vesselID"
                            onChange={(e) => setVesselId(e.value)} filter aria-label="Vessel" />
                        <button type="button" className="sug-btn sug-btn--icon" onClick={load} title="Refresh" aria-label="Refresh">
                            <i className={`pi pi-refresh${loading ? ' pi-spin' : ''}`} aria-hidden="true" />
                        </button>
                        <button type="button" className="sug-btn sug-btn--primary" onClick={() => setShowNew(true)}>
                            <i className="pi pi-plus" aria-hidden="true" /> New suggestion
                        </button>
                    </div>
                </div>

                <div className="feature-card sug-card">
                    <DataTable
                        value={shown}
                        loading={loading}
                        paginator={shown.length > 20}
                        rows={20}
                        sortField="submittedOn"
                        sortOrder={-1}
                        dataKey="suG_MasterID"
                        emptyMessage={(
                            <div className="sug-empty">
                                <i className="pi pi-comments" aria-hidden="true" />
                                {search || tab !== 'All' ? 'No suggestions match.' : 'No suggestions yet.'}
                            </div>
                        )}
                        onRowClick={(e) => openDetail((e.data as SuggestionListItem).suG_MasterID)}
                        rowHover
                        rowClassName={() => 'sug-row'}
                        className="sug-table"
                    >
                        <Column field="suggestionNo" header="No." sortable headerClassName="sug-col-no" bodyClassName="sug-col-no"
                            body={(r: SuggestionListItem) => <span className="sug-no">{r.suggestionNo ?? '–'}</span>} />
                        <Column field="title" header="Suggestion" sortable body={(r: SuggestionListItem) => (
                            <div className="sug-title">
                                <span className="sug-title__main">{r.title}</span>
                                <span className="sug-sub">
                                    <i className="pi pi-tag" aria-hidden="true" /> {r.itemTitle || r.itemType || 'General'}
                                </span>
                            </div>
                        )} />
                        <Column field="vesselName" header="From" sortable body={(r: SuggestionListItem) => (
                            <span className="sug-from">
                                <i className={`pi ${r.vesselID > 0 ? 'pi-compass' : 'pi-building'}`} aria-hidden="true" />
                                {r.vesselName || 'Office'}
                            </span>
                        )} />
                        <Column field="submittedByName" header="By" sortable body={(r: SuggestionListItem) => (
                            <div className="sug-title">
                                <span>{r.submittedByName ?? r.submittedBy}</span>
                                {r.submittedRank && <span className="sug-sub">{r.submittedRank}</span>}
                            </div>
                        )} />
                        <Column field="priority" header="Priority" sortable headerClassName="sug-col-narrow" bodyClassName="sug-col-narrow"
                            body={(r: SuggestionListItem) => <PriorityLabel priority={r.priority} />} />
                        <Column field="status" header="Status" sortable headerClassName="sug-col-status" bodyClassName="sug-col-status"
                            body={(r: SuggestionListItem) => <StatusTag status={r.status} />} />
                        <Column field="submittedOn" header="Submitted" sortable headerClassName="sug-col-date" bodyClassName="sug-col-date"
                            body={(r: SuggestionListItem) => formatDate(r.submittedOn)} />
                    </DataTable>
                </div>
            </main>

            {detail && (
                <SuggestionDialog
                    detail={detail}
                    onHide={closeDetail}
                    onChanged={async () => { await openDetail(detail.suG_MasterID); load(); }}
                />
            )}
            {showNew && <NewSuggestionDialog onHide={() => setShowNew(false)} onSaved={() => { setShowNew(false); setTab('Open'); load(); }} />}
        </div>
    );
};

const SuggestionDialog: React.FC<{ detail: SuggestionDetail; onHide: () => void; onChanged: () => void }> = ({ detail, onHide, onChanged }) => {
    const [nextStatus, setNextStatus] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [implType, setImplType] = useState<string | null>(null);
    const [implId, setImplId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            if (nextStatus) await featureApi.suggestions.setStatus(detail.suG_MasterID, nextStatus, comment, implType, implId);
            else if (comment.trim()) await featureApi.suggestions.comment(detail.suG_MasterID, comment.trim());
            else return;
            setNextStatus(null);
            setComment('');
            notify.success(nextStatus ? `Status: ${STATUS_LABEL[nextStatus]}` : 'Comment added');
            onChanged();
        } catch (err) {
            notify.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const moves = MOVES[detail.status] ?? [];

    return (
        <Dialog header={`${detail.suggestionNo ?? 'Suggestion'} – ${detail.title}`} visible onHide={onHide} className="feature-dialog" style={{ width: '900px', maxWidth: '96vw' }}>
            <div className="reader-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <StatusTag status={detail.status} />
                <span><i className="pi pi-flag" /> {detail.vesselName || 'Office'}</span>
                <span><i className="pi pi-user" /> {detail.submittedByName ?? detail.submittedBy}{detail.submittedRank ? ` (${detail.submittedRank})` : ''}</span>
                <span><i className="pi pi-calendar" /> {formatDateTime(detail.submittedOn)}</span>
                <span>Priority: {detail.priority}</span>
                {detail.itemType && <span>About: {detail.itemTitle || `${detail.itemType} ${detail.itemID}`}</span>}
            </div>
            {detail.quotedText && <blockquote style={{ borderLeft: '3px solid var(--border-color)', margin: '0 0 12px', padding: '4px 12px' }}>{detail.quotedText}</blockquote>}
            {detail.description && <p style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</p>}
            {detail.files.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    {detail.files.map((f) => (
                        <Button key={f.id} label={`${f.fileName} (${formatSize(f.blobSize)})`} icon="pi pi-paperclip" text size="small"
                            onClick={() => openApiFile(featureApi.suggestions.fileUrl(f.id), f.fileName).catch((e) => notify.error(errorMessage(e)))} />
                    ))}
                </div>
            )}

            <h4>History</h4>
            <ul className="feature-log">
                {detail.log.map((l) => (
                    <li key={l.suG_LogID}>
                        <div className="log-head">
                            <span>{formatDateTime(l.logDate)}</span>
                            <span>{l.userName ?? l.userID}</span>
                            {l.status && <StatusTag status={l.status} />}
                        </div>
                        {l.comment && <div className="log-text">{l.comment}</div>}
                    </li>
                ))}
            </ul>

            <div className="feature-form" style={{ marginTop: 16 }}>
                <div className="field">
                    <label htmlFor="sug-next">Change status</label>
                    <Dropdown id="sug-next" value={nextStatus} showClear placeholder="Keep the status (comment only)"
                        options={moves.map((m) => ({ label: STATUS_LABEL[m], value: m }))} onChange={(e) => setNextStatus(e.value ?? null)} />
                </div>
                {nextStatus === 'Implemented' && (
                    <div className="field">
                        <label>Implemented in</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Dropdown value={implType} options={ITEM_TYPES.slice(1)} onChange={(e) => setImplType(e.value)} placeholder="Type" />
                            <InputNumber value={implId} onValueChange={(e) => setImplId(e.value ?? null)} placeholder="ID" useGrouping={false} />
                        </div>
                    </div>
                )}
                <div className="field full">
                    <label htmlFor="sug-comment">
                        {nextStatus === 'NeedsInfo' ? 'What information is needed' : nextStatus === 'Rejected' ? 'Reason' : 'Comment'}
                    </label>
                    <InputTextarea id="sug-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} autoResize />
                    {detail.vesselID > 0 && <span className="hint">Status changes and comments go to the vessel with the next sync.</span>}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <Button label="Close" text onClick={onHide} />
                <Button label={nextStatus ? 'Save status' : 'Add comment'} icon="pi pi-check" loading={busy}
                    disabled={!nextStatus && !comment.trim()} onClick={save} />
            </div>
        </Dialog>
    );
};

const TITLE_MAX = 250;

/** A new suggestion from the office. Also opened from a manual / circular with that item already chosen. */
export const NewSuggestionDialog: React.FC<{
    onHide: () => void;
    onSaved: () => void;
    itemType?: string;
    itemId?: number;
    itemTitle?: string;
}> = ({ onHide, onSaved, itemType, itemId, itemTitle }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<string>(itemType ?? GENERAL);
    const [quoted, setQuoted] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const titleMissing = !title.trim();

    const addFiles = (list: FileList | null) => {
        const picked = Array.from(list ?? []);
        // The same file picked twice is kept once.
        setFiles((prev) => [...prev, ...picked.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
        if (fileInput.current) fileInput.current.value = '';
    };

    const save = async () => {
        setTried(true);
        if (titleMissing) return;
        const sendType = type !== GENERAL ? type : null;
        const form = new FormData();
        form.append('title', title.trim());
        if (description.trim()) form.append('description', description.trim());
        if (sendType) form.append('itemType', sendType);
        if (sendType && sendType === itemType && itemId) form.append('itemId', String(itemId));
        if (quoted.trim()) form.append('quotedText', quoted.trim());
        form.append('priority', priority);
        files.forEach((f) => form.append('files', f));
        setBusy(true);
        try {
            await featureApi.suggestions.create(form);
            notify.success('Suggestion submitted');
            onSaved();
        } catch (err) {
            notify.error(errorMessage(err), 'Could not submit the suggestion');
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <div className="feature-dialog-footer sug-footer">
            <button type="button" className="sug-btn" onClick={onHide} disabled={busy}>Cancel</button>
            <button type="button" className="sug-btn sug-btn--primary" onClick={save} disabled={busy}>
                <i className={`pi ${busy ? 'pi-spin pi-spinner' : 'pi-send'}`} aria-hidden="true" /> {busy ? 'Submitting…' : 'Submit suggestion'}
            </button>
        </div>
    );

    return (
        <Dialog header="New suggestion" visible onHide={onHide} className="feature-dialog sug-new" footer={footer}
            style={{ width: '760px', maxWidth: '96vw' }} closable={!busy}>
            <div className="sug-form">
                <div className="sug-field">
                    <label htmlFor="ns-title">Title <span className="sug-req" aria-hidden="true">*</span></label>
                    <InputText id="ns-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} autoFocus
                        placeholder="A short summary of the suggestion" className={tried && titleMissing ? 'p-invalid' : undefined}
                        aria-invalid={tried && titleMissing} />
                    <div className="sug-field__foot">
                        {tried && titleMissing ? <span className="sug-error">Enter a title.</span> : <span />}
                        <span className="sug-counter">{title.length}/{TITLE_MAX}</span>
                    </div>
                </div>

                <div className="sug-row2">
                    <div className="sug-field">
                        <label htmlFor="ns-about">About</label>
                        {itemTitle
                            ? <div className="sug-about"><i className="pi pi-tag" aria-hidden="true" /> {itemTitle}</div>
                            : <Dropdown inputId="ns-about" value={type} options={ITEM_TYPES} onChange={(e) => setType(e.value ?? GENERAL)} />}
                    </div>
                    <div className="sug-field">
                        <label id="ns-priority">Priority</label>
                        <SelectButton className="sug-prio-select" value={priority} options={PRIORITIES} aria-labelledby="ns-priority"
                            onChange={(e) => { if (e.value) setPriority(e.value); }} />
                    </div>
                </div>

                <div className="sug-field">
                    <label htmlFor="ns-desc">Suggestion</label>
                    <InputTextarea id="ns-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} autoResize
                        placeholder="What should change, and why? What would it improve?" />
                </div>

                <div className="sug-field">
                    <label htmlFor="ns-quote">Text it is about <span className="sug-opt">optional</span></label>
                    <InputTextarea id="ns-quote" value={quoted} onChange={(e) => setQuoted(e.target.value)} rows={2} maxLength={1000} autoResize
                        placeholder="Paste the sentence or paragraph from the manual or circular" />
                </div>

                <div className="sug-field">
                    <label>Attachments <span className="sug-opt">optional</span></label>
                    <input ref={fileInput} id="ns-files" type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                    <div className="sug-files">
                        {files.map((f, i) => (
                            <span className="sug-file" key={`${f.name}-${f.size}`}>
                                <i className="pi pi-paperclip" aria-hidden="true" />
                                <span className="sug-file__name" title={f.name}>{f.name}</span>
                                <span className="sug-file__size">{formatSize(f.size)}</span>
                                <button type="button" className="sug-file__remove" aria-label={`Remove ${f.name}`}
                                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                                    <i className="pi pi-times" aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                        <button type="button" className="sug-btn sug-btn--dashed" onClick={() => fileInput.current?.click()}>
                            <i className="pi pi-upload" aria-hidden="true" /> Add files
                        </button>
                    </div>
                </div>
            </div>
        </Dialog>
    );
};

export default SuggestionsPage;
