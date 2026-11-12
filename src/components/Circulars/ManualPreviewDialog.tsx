import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import { itemLink } from '../../services/featureApi';
import { sanitizeHtml } from '../utils/sanitize';
import '../Features/Features.scss';

interface ManualPreviewDialogProps {
    manualId: number;
    manualNo?: string;
    manualName?: string;
    /** What the circular says about the manual, e.g. "Amends" and "Section 4.2". */
    linkTypeText?: string;
    remarks?: string | null;
    onHide: () => void;
}

/**
 * Shows a manual's text in a popup, so a circular's linked manual can be read without leaving the circular.
 * Text: GET api/Manuals/GetManualContent (the same as the Manuals page), cleaned with sanitizeHtml before it is shown.
 */
const ManualPreviewDialog: React.FC<ManualPreviewDialogProps> = ({ manualId, manualNo, manualName, linkTypeText, remarks, onHide }) => {
    const navigate = useNavigate();
    const [html, setHtml] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [withSubSections, setWithSubSections] = useState(false);

    useEffect(() => {
        let alive = true;
        setHtml(null);
        setError(null);
        dmsLifecycleService
            .getApiCall<string>(`Manuals/GetManualContent?dm_ManualID=${manualId}&IncludeSubManuals=${withSubSections}`)
            .then((text) => { if (alive) setHtml(sanitizeHtml(text)); })
            .catch((err) => { if (alive) setError(errorMessage(err, 'The manual could not be loaded.')); });
        return () => { alive = false; };
    }, [manualId, withSubSections]);

    const openInManuals = () => {
        const link = itemLink('Manual', manualId);
        onHide();
        navigate({ pathname: link.pathname, search: link.search });
    };

    const header = (
        <div className="manual-preview-title">
            <span className="manual-preview-icon"><i className="pi pi-book" aria-hidden="true" /></span>
            <div>
                {manualNo && <span className="manual-preview-no">{manualNo}</span>}
                <span className="manual-preview-name">{manualName || `Manual ${manualId}`}</span>
            </div>
        </div>
    );

    const footer = (
        <div className="feature-dialog-footer manual-preview-footer">
            <span className="manual-preview-check">
                <Checkbox inputId="mp-sub" checked={withSubSections} onChange={(e) => setWithSubSections(!!e.checked)} />
                <label htmlFor="mp-sub">Include sub-sections</label>
            </span>
            <span style={{ flex: 1 }} />
            <Button type="button" label="Open in Manuals" icon="pi pi-external-link" text onClick={openInManuals} />
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
                        This circular {linkTypeText ? <strong>{linkTypeText.toLowerCase()}</strong> : 'refers to'} this manual
                        {remarks ? <> – <strong>{remarks}</strong></> : null}.
                    </span>
                </div>
            )}
            {error ? (
                <div className="manual-preview-state error" role="alert"><i className="pi pi-exclamation-circle" aria-hidden="true" /> {error}</div>
            ) : html === null ? (
                <div className="manual-preview-state" role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Loading the manual…</div>
            ) : html.trim() === '' ? (
                <div className="manual-preview-state">This manual has no text yet.</div>
            ) : (
                <div className="manual-preview-body" dangerouslySetInnerHTML={{ __html: html }} />
            )}
        </Dialog>
    );
};

export default ManualPreviewDialog;
