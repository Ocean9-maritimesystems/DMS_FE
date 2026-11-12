import React from 'react';
import { Dialog } from 'primereact/dialog';
import { ReportPanel } from './ReportsPage';
import { REPORT_CONTEXTS, ReportContextKey } from './reportCatalog';
import './ReportsPage.scss';

/** The reports of one area in a large dialog (opened from the Manuals and Circulars dashboards). */
const ReportDialog: React.FC<{ context: ReportContextKey | null; onHide: () => void }> = ({ context, onHide }) => (
    <Dialog
        visible={context != null}
        onHide={onHide}
        header={context ? (
            <span className="rp-dialog-title">
                <i className={REPORT_CONTEXTS[context].icon} aria-hidden="true" /> {REPORT_CONTEXTS[context].title}
            </span>
        ) : null}
        className="rp-dialog"
        style={{ width: 'min(1400px, 96vw)', height: '90vh' }}
        contentClassName="rp-dialog-content"
        maximizable
        draggable={false}
        dismissableMask
    >
        {context && <ReportPanel key={context} context={context} />}
    </Dialog>
);

export default ReportDialog;
