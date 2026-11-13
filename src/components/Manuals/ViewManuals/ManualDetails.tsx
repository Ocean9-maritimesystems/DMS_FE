import React, { useEffect, useState } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './ManualDetails.scss';

export interface ManualDetailsProps {
    dmManualVersionID: number;
    closeForm: () => void;
}

export type ManualDetailsProp = {
    categoryName: string;
    manualCode: string;
    manualNo: string;
    manualName: string;
    version: string;
    statusString: string;
    textContents: string;
    isApprovalRequired: boolean;
    canExport: boolean;
    createdBy: string;
    createdDate: string;
    releasedBy: string;
    releasedDate: string;
    publishedBy: string;
    publishedDate: string;
    lastModifiedBy: string;
    lastModifiedDate: string;
    comments: string;
    dM_ManualID: string;
    dM_ManualVersionID: string;
};

// closeForm: the dialog around the details closes itself (its X), nothing to close from here.
const ManualDetails: React.FC<ManualDetailsProps> = ({ dmManualVersionID }) => {
   const [manualData, setManualData] = useState<ManualDetailsProp>();
   const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        dmsLifecycleService.getApiCall<ManualDetailsProp | null>(`Manuals/GetManualDetailsByVersionId/${dmManualVersionID}`)
                .then((data) => {
                    setManualData(data ?? undefined);
                    setLoading(false);
                })
                .catch(() => {
                    setManualData(undefined);
                    setLoading(false);
                });
    }, [dmManualVersionID]);

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '';

        return dateStr.split('T')[0]; // Returns only the date part
    };

    if (loading) return <div className="md-loading">Loading manual details…</div>;
    if (!manualData) return <div className="md-loading">The details of this manual could not be loaded.</div>;

    const d = manualData;
    const show = (v: string | undefined | null) => (v && String(v).trim() ? v : '–');
    /** What happened to this version, in order; steps that have not happened yet are shown as "Not yet". */
    const history = [
        { label: 'Created', by: d.createdBy, on: d.createdDate, icon: 'pi pi-plus' },
        { label: 'Published for approval', by: d.publishedBy, on: d.publishedDate, icon: 'pi pi-send' },
        { label: 'Released', by: d.releasedBy, on: d.releasedDate, icon: 'pi pi-check' },
        { label: 'Last changed', by: d.lastModifiedBy, on: d.lastModifiedDate, icon: 'pi pi-pencil' },
    ];

    return (
        <div className="manual-details-container md">
            <div className="manual-details-header">
                <div className="manual-title-block">
                    <h3>
                        {d.manualNo && <span className="md-no">{d.manualNo}</span>}
                        {d.manualName || 'Manual details'}
                    </h3>
                    <div className="md-sub">
                        <span>{show(d.categoryName)}</span>
                        <span aria-hidden="true">·</span>
                        <span>Version {show(d.version)}</span>
                        {d.manualCode && <><span aria-hidden="true">·</span><span>Code {d.manualCode}</span></>}
                    </div>
                </div>
                <span className={`manual-status status-${d.statusString?.toLowerCase()}`}>
                    {d.statusString || 'Unknown'}
                </span>
            </div>

            <div className="md-columns">
                <section className="manual-details-section metadata-section">
                    <div className="section-heading">
                        <span className="section-title">Document</span>
                    </div>
                    <dl className="md-list">
                        <div><dt>Category</dt><dd>{show(d.categoryName)}</dd></div>
                        <div><dt>Manual no.</dt><dd>{show(d.manualNo)}</dd></div>
                        <div><dt>Manual code</dt><dd>{show(d.manualCode)}</dd></div>
                        <div><dt>Version</dt><dd>{show(d.version)}</dd></div>
                        <div><dt>Can be exported</dt><dd>{d.canExport ? 'Yes' : 'No'}</dd></div>
                        <div><dt>Needs approval</dt><dd>{d.isApprovalRequired ? 'Yes' : 'No'}</dd></div>
                    </dl>
                </section>

                <section className="manual-details-section metadata-section">
                    <div className="section-heading">
                        <span className="section-title">History of this version</span>
                    </div>
                    <ol className="md-history">
                        {history.map((h) => {
                            const done = !!(h.on || (h.by && h.by.trim()));
                            return (
                                <li key={h.label} className={done ? 'is-done' : ''}>
                                    <span className="md-history__dot" aria-hidden="true"><i className={h.icon} /></span>
                                    <span className="md-history__what">{h.label}</span>
                                    <span className="md-history__when">
                                        {done ? <>{formatDate(h.on) || 'Date not recorded'}{h.by ? <> · {h.by}</> : null}</> : 'Not yet'}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            </div>

            <section className="manual-details-section comment-section">
                <div className="section-heading">
                    <span className="section-title">Comment</span>
                </div>
                <div className={`manual-details-comments${d.comments ? '' : ' is-empty'}`}>
                    {d.comments || 'No comment for this version.'}
                </div>
            </section>

            <section className="manual-details-section content-section">
                <div className="section-heading">
                    <span className="section-title">Content</span>
                </div>
                {/* Shown as the page itself (sanitised), so the dialog has one scroll bar instead of two. */}
                <div className="md-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.textContents) || '<p><em>No content.</em></p>' }} />
            </section>
        </div>
    );
};

export default ManualDetails;