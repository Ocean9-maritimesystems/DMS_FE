import React, { useRef, useState } from 'react';
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
    const [needReason, setNeedReason] = useState(false);
    const commentRef = useRef<HTMLTextAreaElement>(null);

    /** Sending back needs a reason, so the author knows what to change. Approving does not. */
    const confirmAction = (action: 'approve' | 'sendBack') => {
        if (action === 'sendBack' && !comment.trim()) {
            setNeedReason(true);
            commentRef.current?.focus();
            return;
        }
        setPendingAction(action);
    };

    const submitConfirmedAction = () => {
        if (pendingAction === 'approve') {
            onApprove(comment.trim());
        } else if (pendingAction === 'sendBack') {
            onReject(comment.trim());
        }
        setPendingAction(null);
    };

    return (
        <>
            <div className="approve-manual-container">
                <div className="approve-manual-header">
                    <h2>Approve or send back</h2>
                    <Button icon="pi pi-times" className="p-button-rounded p-button-text" onClick={onClose} aria-label="Close" />
                </div>
                <div className="approve-manual-body">
                    <div className="am-summary">
                        <span className="am-summary__icon" aria-hidden="true"><i className="pi pi-book" /></span>
                        <div className="am-summary__text">
                            <div className="am-summary__name" title={manualName}>{manualName || '–'}</div>
                            <div className="am-summary__chips">
                                <span className="am-chip">Version {version || '–'}</span>
                                <span className="am-chip am-chip--status"><i className="pi pi-hourglass" aria-hidden="true" /> Waiting for {status || 'approval'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="approve-manual-section">
                        <label htmlFor="comment-textarea" className="section-title">Comment</label>
                        <textarea
                            id="comment-textarea"
                            ref={commentRef}
                            className={`approve-manual-comment${needReason && !comment.trim() ? ' is-invalid' : ''}`}
                            value={comment}
                            onChange={e => { setComment(e.target.value); if (e.target.value.trim()) setNeedReason(false); }}
                            placeholder="When sending back, say what needs to change."
                            aria-describedby="comment-hint"
                            aria-invalid={needReason && !comment.trim()}
                            rows={4}
                        />
                        <p id="comment-hint" className={`am-hint${needReason && !comment.trim() ? ' is-error' : ''}`}>
                            {needReason && !comment.trim()
                                ? 'Enter the reason for sending it back. The author sees it.'
                                : 'Optional when approving; needed when sending back.'}
                        </p>
                    </div>
                </div>
                <div className="approve-manual-actions">
                    <Button label="Cancel" className="p-button-text am-cancel" onClick={onClose} />
                    <span className="am-spacer" />
                    <Button label="Send back" icon="pi pi-replay" className="p-button-outlined am-sendback" onClick={() => confirmAction('sendBack')} />
                    <Button label="Approve" icon="pi pi-check" className="p-button-success" onClick={() => confirmAction('approve')} />
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
                                ? `Approve ${manualName}? It goes to the next approval step, or is released if this is the last one.`
                                : `Send ${manualName} back to the author with your comment?`}
                        </div>
                        <div className="approve-manual-confirm-actions">
                            <Button label="Cancel" className="approve-manual-confirm-cancel" onClick={() => setPendingAction(null)} />
                            <Button
                                label={pendingAction === 'approve' ? 'Approve' : 'Send back'}
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