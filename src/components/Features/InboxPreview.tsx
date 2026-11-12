import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../config/appConfig';
import authService from '../../services/authService';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import featureApi, { CircularExtras, FileItem, formatSize, InboxItem, SuggestionDetail } from '../../services/featureApi';
import { canOpenInBrowser, sanitizeHtml } from '../utils/sanitize';
import { formatDate, formatDateTime } from '../utils/formatDate';

/**
 * The reading pane of the inbox: the item itself, read only (no buttons).
 *   Circular / Alert         GET Circular/GetCIRDetails/{id} + Circular/{id}/Extras, attachment shown inline
 *   Manual                   GET Manuals/GetManualContent (the manual's text)
 *   Document                 GET OtherDocument/GetOtherDocumentDetails/{id} + its files, shown inline
 *   Suggestion               GET Suggestions/{id} (description, quoted text, history)
 */

const MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain', htm: 'text/html', html: 'text/html',
};

const mimeOf = (fileName?: string | null, fileType?: string | null) => {
    if (fileType && fileType.includes('/')) return fileType;
    const ext = ((fileName || '').split('.').pop() || fileType || '').toLowerCase().replace(/^\./, '');
    return MIME[ext] || 'application/octet-stream';
};

/** base64 text (or a byte array) from the API -> bytes. */
const toBytes = (contents: unknown): Uint8Array | null => {
    if (Array.isArray(contents)) return new Uint8Array(contents as number[]);
    if (typeof contents !== 'string' || !contents.trim()) return null;
    try {
        const base64 = contents.includes(',') ? contents.slice(contents.indexOf(',') + 1) : contents;
        const text = window.atob(base64);
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
};

const Loading: React.FC<{ text?: string }> = ({ text = 'Loading…' }) => (
    <div className="inbox-preview-state" role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> {text}</div>
);

const Failed: React.FC<{ text: string }> = ({ text }) => (
    <div className="inbox-preview-state error" role="alert"><i className="pi pi-exclamation-circle" aria-hidden="true" /> {text}</div>
);

const Facts: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
    <dl className="inbox-facts">
        {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>
        ))}
    </dl>
);

/** A file shown inside the pane (PDF, picture, text); other types are listed by name only. */
const FileView: React.FC<{ name: string; type: string; size?: number; bytes?: Uint8Array | null; endpoint?: string }> = ({ name, type, size, bytes, endpoint }) => {
    const viewable = canOpenInBrowser(type);
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!viewable) return undefined;
        let alive = true;
        let made: string | null = null;
        const show = (blob: Blob) => {
            made = URL.createObjectURL(blob);
            if (alive) setUrl(made); else URL.revokeObjectURL(made);
        };
        setUrl(null);
        setFailed(false);
        if (bytes && bytes.length) {
            show(new Blob([bytes as BlobPart], { type }));
        } else if (endpoint) {
            const token = authService.token();
            axios.get(`${API_URL}/${endpoint}`, { responseType: 'blob', headers: token ? { Authorization: `Bearer ${token}` } : undefined })
                .then((r) => show(new Blob([r.data as BlobPart], { type })))
                .catch(() => { if (alive) setFailed(true); });
        }
        return () => {
            alive = false;
            if (made) URL.revokeObjectURL(made);
        };
    }, [bytes, endpoint, type, viewable]);

    return (
        <figure className="inbox-file">
            <figcaption>
                <i className="pi pi-paperclip" aria-hidden="true" />
                <span className="inbox-file-name">{name}</span>
                {size ? <span className="inbox-file-size">{formatSize(size)}</span> : null}
            </figcaption>
            {!viewable ? (
                <div className="inbox-file-note">This file type cannot be shown here.</div>
            ) : failed ? (
                <div className="inbox-file-note">The file could not be loaded.</div>
            ) : !url ? (
                <Loading text="Loading the file…" />
            ) : type.startsWith('image/') ? (
                <img src={url} alt={name} />
            ) : (
                <iframe src={url} title={name} />
            )}
        </figure>
    );
};

// ---------------------------------------------------------------------------------------- Circular / Alert

interface CircularDetails {
    ciR_Number?: string;
    title?: string;
    reference?: string;
    status?: string;
    priority?: number | string;
    dateIssued?: string | null;
    releasedDate?: string | null;
    remarks?: string | null;
    description?: string;
    fileName?: string;
    fileType?: string;
    originalFileType?: string;
    blobContents?: string | number[] | null;
}

const PRIORITY: Record<string, string> = { '1': 'High', '2': 'Medium', '3': 'Low' };

const CircularView: React.FC<{ id: number }> = ({ id }) => {
    const [details, setDetails] = useState<CircularDetails | null>(null);
    const [extras, setExtras] = useState<CircularExtras | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setDetails(null); setExtras(null); setError(null);
        dmsLifecycleService.getApiCall<CircularDetails>(`Circular/GetCIRDetails/${id}`)
            .then((d) => { if (alive) setDetails(d); })
            .catch((err) => { if (alive) setError(errorMessage(err, 'The circular could not be loaded.')); });
        featureApi.circular.get(id).then((x) => { if (alive) setExtras(x); }).catch(() => undefined);
        return () => { alive = false; };
    }, [id]);

    const bytes = useMemo(() => toBytes(details?.blobContents), [details]);

    if (error) return <Failed text={error} />;
    if (!details) return <Loading />;

    const name = details.fileName || details.description || `${details.ciR_Number || `circular-${id}`}.${(details.fileType || 'pdf').replace(/^\./, '')}`;
    const status = extras?.status === 'Cancelled' ? 'Cancelled' : details.status;
    return (
        <>
            <div className="inbox-tags">
                {status && <span className={`feature-tag ${status === 'Cancelled' ? 'cancelled' : status === 'Draft' ? 'muted' : 'info'}`}>{status}</span>}
                {details.priority != null && details.priority !== '' && (
                    <span className="feature-tag muted">{PRIORITY[String(details.priority)] || details.priority} priority</span>
                )}
                {extras?.supersededByNumber && <span className="feature-tag cancelled">Superseded by {extras.supersededByNumber}</span>}
            </div>
            <Facts rows={[
                ['Number', details.ciR_Number],
                ['Reference', details.reference],
                ['Issued', details.dateIssued ? formatDate(details.dateIssued) : null],
                ['Released', details.releasedDate ? formatDate(details.releasedDate) : 'Not released'],
                ['Valid until', extras?.validUntil ? formatDate(extras.validUntil) : 'No end date'],
            ]} />
            {details.remarks && (
                <section className="inbox-section">
                    <h5>Message</h5>
                    <p className="inbox-text">{details.remarks}</p>
                </section>
            )}
            <section className="inbox-section">
                <h5>Attachment</h5>
                {bytes && bytes.length
                    ? <FileView name={name} type={mimeOf(name, details.originalFileType || details.fileType)} size={bytes.length} bytes={bytes} />
                    : <p className="inbox-none">No attachment.</p>}
            </section>
        </>
    );
};

// ---------------------------------------------------------------------------------------- Manual

const ManualView: React.FC<{ id: number }> = ({ id }) => {
    const [html, setHtml] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setHtml(null); setError(null);
        dmsLifecycleService.getApiCall<string>(`Manuals/GetManualContent?dm_ManualID=${id}&IncludeSubManuals=false`)
            .then((text) => { if (alive) setHtml(sanitizeHtml(text)); })
            .catch((err) => { if (alive) setError(errorMessage(err, 'The manual could not be loaded.')); });
        return () => { alive = false; };
    }, [id]);

    if (error) return <Failed text={error} />;
    if (html === null) return <Loading text="Loading the manual…" />;
    if (!html.trim()) return <p className="inbox-none">This manual has no text yet.</p>;
    return <div className="inbox-manual" dangerouslySetInnerHTML={{ __html: html }} />;
};

// ---------------------------------------------------------------------------------------- Document 
interface DocumentDetails {
    documentType?: string;
    documentNumber?: string;
    documentTitle?: string;
    status?: string;
    reference?: string;
    comments?: string;
    uploadedOn?: string;
    uploadedBy?: string;
}

const DocumentView: React.FC<{ id: number }> = ({ id }) => {
    const [doc, setDoc] = useState<DocumentDetails | null>(null);
    const [files, setFiles] = useState<FileItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setDoc(null); setFiles(null); setError(null);
        dmsLifecycleService.getApiCall<DocumentDetails>(`OtherDocument/GetOtherDocumentDetails/${id}`)
            .then((d) => { if (alive) setDoc(d ?? {}); })
            .catch((err) => { if (alive) setError(errorMessage(err, 'The document could not be loaded.')); });
        featureApi.folders.documentFiles(id)
            .then((f) => { if (alive) setFiles(Array.isArray(f) ? f : []); })
            .catch(() => { if (alive) setFiles([]); });
        return () => { alive = false; };
    }, [id]);

    if (error) return <Failed text={error} />;
    if (!doc) return <Loading />;
    return (
        <>
            <div className="inbox-tags">
                {doc.documentType && <span className="feature-tag muted">{doc.documentType}</span>}
                {doc.status && <span className="feature-tag info">{doc.status}</span>}
            </div>
            <Facts rows={[
                ['Number', doc.documentNumber],
                ['Reference', doc.reference],
                ['Added', doc.uploadedOn ? formatDate(doc.uploadedOn) : null],
                ['Added by', doc.uploadedBy],
            ]} />
            {doc.comments && (
                <section className="inbox-section">
                    <h5>Comments</h5>
                    <p className="inbox-text">{doc.comments}</p>
                </section>
            )}
            <section className="inbox-section">
                <h5>{files && files.length > 1 ? `Files (${files.length})` : 'File'}</h5>
                {files === null ? <Loading text="Loading the files…" />
                    : files.length === 0 ? <p className="inbox-none">No files.</p>
                    : files.map((f) => (
                        <FileView key={f.id} name={f.fileName} type={mimeOf(f.fileName, f.fileType)} size={f.blobSize}
                            endpoint={`OtherDocument/Files/${f.id}`} />
                    ))}
            </section>
        </>
    );
};

// ---------------------------------------------------------------------------------------- Suggestion

const SUGGESTION_STATUS: Record<string, string> = { UnderReview: 'Under review', NeedsInfo: 'Needs info' };

const SuggestionView: React.FC<{ id: number }> = ({ id }) => {
    const [s, setS] = useState<SuggestionDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setS(null); setError(null);
        featureApi.suggestions.get(id)
            .then((d) => { if (alive) setS(d); })
            .catch((err) => { if (alive) setError(errorMessage(err, 'The suggestion could not be loaded.')); });
        return () => { alive = false; };
    }, [id]);

    if (error) return <Failed text={error} />;
    if (!s) return <Loading />;
    return (
        <>
            <div className="inbox-tags">
                <span className={`feature-tag ${s.status.toLowerCase()}`}>{SUGGESTION_STATUS[s.status] ?? s.status}</span>
                {s.priority && <span className="feature-tag muted">{s.priority} priority</span>}
            </div>
            <Facts rows={[
                ['Number', s.suggestionNo],
                ['From', [s.submittedByName || s.submittedBy, s.submittedRank, s.vesselName].filter(Boolean).join(' · ')],
                ['Submitted', formatDate(s.submittedOn)],
                ['About', s.itemTitle || (s.itemType ? `${s.itemType} ${s.itemID ?? ''}` : null)],
            ]} />
            {s.description && (
                <section className="inbox-section">
                    <h5>Suggestion</h5>
                    <p className="inbox-text">{s.description}</p>
                </section>
            )}
            {s.quotedText && (
                <section className="inbox-section">
                    <h5>Quoted text</h5>
                    <blockquote className="inbox-quote">{s.quotedText}</blockquote>
                </section>
            )}
            {s.files?.length > 0 && (
                <section className="inbox-section">
                    <h5>Files</h5>
                    {s.files.map((f) => (
                        <FileView key={f.id} name={f.fileName} type={mimeOf(f.fileName, f.fileType)} size={f.blobSize}
                            endpoint={`Suggestions/File/${f.id}`} />
                    ))}
                </section>
            )}
            {s.log?.length > 0 && (
                <section className="inbox-section">
                    <h5>History</h5>
                    <ol className="inbox-history">
                        {s.log.map((l) => (
                            <li key={l.suG_LogID}>
                                <div className="inbox-history-head">
                                    {l.status && <span className={`feature-tag ${l.status.toLowerCase()}`}>{SUGGESTION_STATUS[l.status] ?? l.status}</span>}
                                    <span>{l.userName || l.userID}</span>
                                    <span className="inbox-history-date">{formatDateTime(l.logDate)}</span>
                                </div>
                                {l.comment && <p className="inbox-text">{l.comment}</p>}
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </>
    );
};

// ---------------------------------------------------------------------------------------- Pane

const InboxPreview: React.FC<{ item: InboxItem }> = ({ item }) => {
    switch (item.itemType) {
        case 'Circular':
        case 'Alert':
            return <CircularView id={item.itemID} />;
        case 'Manual':
            return <ManualView id={item.itemID} />;
        case 'Document':
            return <DocumentView id={item.itemID} />;
        case 'Suggestion':
            return <SuggestionView id={item.itemID} />;
        default:
            return <p className="inbox-none">This item cannot be shown here.</p>;
    }
};

export default InboxPreview;
