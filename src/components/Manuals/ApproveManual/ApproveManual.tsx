import React, { useState } from 'react';
import { Button } from 'primereact/button';
import './ApproveManual.scss';

export interface ApproveManualProps {
    manualName: string;
    version: string;
    status: string;
    comments?: string;
    onApprove: (comment: string) => void;
    onReject: (comment: string) => void;
    onClose: () => void;
}

const ApproveManual: React.FC<ApproveManualProps> = ({
    manualName,
    version,
    status,
    onApprove,
    onReject,
    onClose
}) => {
    const [comment, setComment] = useState('');
    const [pendingAction, setPendingAction] = useState<'approve' | 'sendBack' | null>(null);

    const confirmAction = (action: 'approve' | 'sendBack') => {
        setPendingAction(action);
    };

    const submitConfirmedAction = () => {
        if (pendingAction === 'approve') {
            onApprove(comment);
        } else if (pendingAction === 'sendBack') {
            onReject(comment);
        }
        setPendingAction(null);
    };

    return (
        <>
            <div className="approve-manual-container">
                <div className="approve-manual-header">
                    <h2>Approve Manual</h2>
                    <Button icon="pi pi-times" className="p-button-rounded p-button-text" onClick={onClose} />
                </div>
                <div className="approve-manual-body">
                    <div className="approve-manual-metadata">
                        <div className="meta-item">
                            <span className="meta-label">Version:</span>
                            <span className="meta-value">{version}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">Status:</span>
                            <span className="meta-value">{status}</span>
                        </div>
                        <div className="meta-item full-width">
                            <span className="meta-label">Manual Name:</span>
                            <span className="meta-value">{manualName}</span>
                        </div>
                    </div>
                    <div className="approve-manual-section">
                        <label htmlFor="comment-textarea" className="section-title">Comments</label>
                        <textarea
                            id="comment-textarea"
                            className="approve-manual-comment"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Add your comment (optional)"
                            rows={4}
                        />
                    </div>
                </div>
                <div className="approve-manual-actions">
                    <Button label="Approve" icon="pi pi-check" className="p-button-success" onClick={() => confirmAction('approve')} />
                    <Button label="Send Back" icon="pi pi-times" className="p-button-danger" onClick={() => confirmAction('sendBack')} />
                </div>
            </div>
            {pendingAction && (
                <div className="confirm-overlay approve-manual-confirm-overlay" role="presentation">
                    <div className="confirm-popup approve-manual-confirm-popup" role="dialog" aria-modal="true" aria-labelledby="approve-manual-confirm-title">
                        <div className="approve-manual-confirm-header">
                            <span className="approve-manual-confirm-icon" aria-hidden="true">
                                <i className="pi pi-exclamation-triangle" />
                            </span>
                            <h3 id="approve-manual-confirm-title">
                                {pendingAction === 'approve' ? 'Confirm approval' : 'Confirm send back'}
                            </h3>
                        </div>
                        <div className="approve-manual-confirm-content">
                            {pendingAction === 'approve'
                                ? 'Are you sure you want to approve this manual?'
                                : 'Are you sure you want to send this manual back?'}
                        </div>
                        <div className="approve-manual-confirm-actions">
                            <Button label="Cancel" className="approve-manual-confirm-cancel" onClick={() => setPendingAction(null)} />
                            <Button
                                label={pendingAction === 'approve' ? 'Approve' : 'Send Back'}
                                className={pendingAction === 'approve' ? 'approve-manual-confirm-approve' : 'approve-manual-confirm-sendback'}
                                onClick={submitConfirmedAction}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ApproveManual;