import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import featureApi, { CircularExtras, itemLink } from '../../services/featureApi';
import notify from '../../services/notify';
import { canOpenInBrowser } from '../utils/sanitize';
import { formatDate } from '../utils/formatDate';
import '../Features/Features.scss';

/** What GET api/Circular/GetCIRDetails/{id} returns (only the fields shown here). */
interface CircularDetails {
    ciR_MasterID: number;
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

interface CircularPreviewDialogProps {
    circularId: number;
    /** Shown while loading and as a fallback. */
    number?: string;
    title?: string;
    isAlert?: boolean;
    /** How the circular relates to the manual being viewed, e.g. "Amends" and "Section 4.2". */
    linkTypeText?: string;
    remarks?: string | null;
    onHide: () => void;
}

const FILE_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const PRIORITY: Record<string, string> = { '1': 'High', '2': 'Medium', '3': 'Low' };

/** The attachment bytes (the API sends base64 text). */
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

/**
 * A circular or alert in a popup: its details, message and attachment (PDF and pictures are shown in the popup,
 * other files can be downloaded). Opened from a manual's "Related circulars and alerts", so the manual stays open.
 * Data: GET api/Circular/GetCIRDetails/{id} and GET api/Circular/{id}/Extras (valid until, cancelled / superseded).
 */
const CircularPreviewDialog: React.FC<CircularPreviewDialogProps> = ({ circularId, number, title, isAlert, linkTypeText, remarks, onHide }) => {
    const navigate = useNavigate();
    const [details, setDetails] = useState<CircularDetails | null>(null);
    const [extras, setExtras] = useState<CircularExtras | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        dmsLifecycleService.getApiCall<CircularDetails>(`Circular/GetCIRDetails/${circularId}`)
            .then((d) => { if (alive) setDetails(d); })
            .catch((err) => { if (alive) setError(errorMessage(err, 'The circular could not be loaded.')); });
        featureApi.circular.get(circularId).then((x) => { if (alive) setExtras(x); }).catch(() => undefined);
        return () => { alive = false; };
    }, [circularId]);

    // The attachment as a file the browser can show (PDF, picture, text) or download.
    const file = useMemo(() => {
        const bytes = toBytes(details?.blobContents);
        if (!details || !bytes || bytes.length === 0) return null;
        const name = details.fileName || details.description || `${details.ciR_Number || `circular-${circularId}`}.${(details.fileType || 'pdf').replace(/^\./, '')}`;
        const ext = (name.split('.').pop() || '').toLowerCase();
        const type = FILE_TYPES[ext]
            || (String(details.originalFileType || '').includes('/') ? details.originalFileType : undefined)
            || 'application/octet-stream';
        return { name, type, bytes, size: bytes.length };
    }, [details, circularId]);

    const [fileUrl, setFileUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) { setFileUrl(null); return undefined; }
        const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
        setFileUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const canShow = !!file && canOpenInBrowser(file.type);

    const download = () => {
        if (!file || !fileUrl) return;
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        notify.info(`Downloading ${file.name}`);
    };

    const openInCirculars = () => {
        const link = itemLink(isAlert ? 'Alert' : 'Circular', circularId);
        onHide();
        navigate({ pathname: link.pathname, search: link.search });
    };

    const status = extras?.status === 'Cancelled' ? 'Cancelled' : details?.status;
    const priority = details ? PRIORITY[String(details.priority ?? '')] || String(details.priority ?? '') : '';

    const header = (
        <div className="manual-preview-title">
            <span className="manual-preview-icon"><i className={isAlert ? 'pi pi-exclamation-triangle' : 'pi pi-megaphone'} aria-hidden="true" /></span>
            <div>
                <span className="manual-preview-no">{details?.ciR_Number || number}</span>
                <span className="manual-preview-name">{details?.title || title || `Circular ${circularId}`}</span>
            </div>
        </div>
    );

    const footer = (
        <div className="feature-dialog-footer manual-preview-footer">
            {file && <Button type="button" label="Download attachment" icon="pi pi-download" text onClick={download} />}
            <span style={{ flex: 1 }} />
            <Button type="button" label={isAlert ? 'Open in Alerts' : 'Open in Circulars'} icon="pi pi-external-link" text onClick={openInCirculars} />
            <Button type="button" label="Close" onClick={onHide} />
        </div>
    );

    return (
        <Dialog header={header} footer={footer} visible onHide={onHide} className="feature-dialog manual-preview-dialog"
            style={{ width: '900px', maxWidth: '96vw' }} breakpoints={{ '640px': '100vw' }} maximizable draggable={false} dismissableMask>
            {(linkTypeText || remarks) && (
                <div className="manual-preview-context">
                    <i className="pi pi-link" aria-hidden="true" />
                    <span>
                        This {isAlert ? 'alert' : 'circular'} {linkTypeText ? <strong>{linkTypeText.toLowerCase()}</strong> : 'refers to'} the manual
                        {remarks ? <> – <strong>{remarks}</strong></> : null}.
                    </span>
                </div>
            )}

            {error ? (
                <div className="manual-preview-state error" role="alert"><i className="pi pi-exclamation-circle" aria-hidden="true" /> {error}</div>
            ) : !details ? (
                <div className="manual-preview-state" role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Loading…</div>
            ) : (
                <div className="circular-preview">
                    <div className="circular-preview-tags">
                        {status && <span className={`feature-tag ${status === 'Cancelled' ? 'cancelled' : status === 'Draft' ? 'muted' : 'info'}`}>{status}</span>}
                        {priority && <span className="feature-tag muted">{priority} priority</span>}
                        {extras?.supersededByNumber && <span className="feature-tag cancelled">Superseded by {extras.supersededByNumber}</span>}
                    </div>

                    <dl className="circular-preview-facts">
                        <div><dt>Reference</dt><dd>{details.reference || '—'}</dd></div>
                        <div><dt>Issued</dt><dd>{details.dateIssued ? formatDate(details.dateIssued) : '—'}</dd></div>
                        <div><dt>Released</dt><dd>{details.releasedDate ? formatDate(details.releasedDate) : 'Not released'}</dd></div>
                        <div><dt>Valid until</dt><dd>{extras?.validUntil ? formatDate(extras.validUntil) : 'No end date'}</dd></div>
                    </dl>

                    {details.remarks && (
                        <section className="circular-preview-message">
                            <h5>Message / remarks</h5>
                            <p>{details.remarks}</p>
                        </section>
                    )}

                    <section className="circular-preview-file">
                        <h5>Attachment</h5>
                        {!file ? (
                            <p className="circular-preview-none">No attachment.</p>
                        ) : canShow && fileUrl ? (
                            file.type.startsWith('image/')
                                ? <img src={fileUrl} alt={file.name} />
                                : <iframe src={fileUrl} title={file.name} />
                        ) : (
                            <div className="circular-preview-download">
                                <i className="pi pi-file" aria-hidden="true" />
                                <span>{file.name}</span>
                                <span className="circular-preview-size">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                                <Button type="button" label="Download" icon="pi pi-download" size="small" outlined onClick={download} />
                            </div>
                        )}
                    </section>
                </div>
            )}
        </Dialog>
    );
};

export default CircularPreviewDialog;
