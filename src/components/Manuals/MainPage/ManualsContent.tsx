import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import { ContextMenu } from 'primereact/contextmenu';
import { setError } from '../../../store/slices/appSlice';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { downloadAsWord } from '../../utils/DownloadManuals';
import { downloadAsPDF } from '../../utils/DownloadManuals';
import { useTheme } from '../../../contexts/ThemeContext';
import JoditEditor from 'jodit-react';
import { sanitizeHtml } from '../../utils/sanitize';
import CompareVersion from '../CompareVersion/CompareVersion';
import CompareVersionDetails from '../CompareVersion/CompareVersionDetails';
import ManualDetails from '../ViewManuals/ManualDetails';
import ApproveManual from '../ApproveManual/ApproveManual';
import AddEditManual, { type ManualFormData } from '../AddEditManual/AddEditManual';
import type { ManualFormData as CompareFormData } from '../CompareVersion/CompareVersion';
import dmsLifecycleService, { errorMessage } from '../../../services/DMSLifecycleService';
import './ManualsContent.scss';
import ViewCompareManualDetails from '../CompareVersion/ViewCompareManualDetails';
import ManualVersionHistory from './ManualVersionHistory';
import { formatDate } from '../../utils/formatDate';
import { ManualRelatedCirculars } from '../../Circulars/CircularExtrasPanel';

export interface ManualDetailsProps {
    userId: string;
    onRefreshTree?: () => void;
}

/** api/Manuals/GetApprovalProgress */
interface ApprovalStep {
    statusId: number;
    name: string;
    role?: string;
    dept?: string;
    state: 'done' | 'current' | 'pending';
    approvedBy?: string;
    approvedOn?: string;
    comments?: string;
}
interface ApprovalProgress {
    approvalRequired: boolean;
    statusId: number;
    steps: ApprovalStep[];
}

/** One step in the bar above the text. */
interface StatusStep {
    key: string;
    label: string;
    sub?: string;
    hint?: string;
    state: 'done' | 'current' | 'pending';
}

/** api/Manuals/ApproveManual and SendBackManual */
interface ManualApprovalRequest {
    dM_ManualID: string | number | undefined;
    dM_ManualVersionID: number | undefined;
    userID: string;
    comments: string;
}

const ManualsContent: React.FC<ManualDetailsProps> = ({userId, onRefreshTree})  => {
    const dispatch = useDispatch();
    const manualInfo = useSelector((state: RootState) => state.appInfo);
    const [manualID, setManualID] = useState<number>(-1);
    const [isFavourite, setIsFavourite] = useState<boolean>(false);
    const [manualText, setManualText] = useState("");
    const [isChecked, setIsChecked] = useState(true);
    const [isManualReleased, setIsManualReleased] = useState(false);
    const [visibleAddEditDialog, setVisibleAddEditDialog] = useState<boolean>(false);
    const [visibleCompareVersionDialog, setVisibleCompareVersionDialog] = useState<boolean>(false);
    const [visibleCompareVersionDetailsDialog, setVisibleCompareVersionDetailsDialog] = useState<boolean>(false);
    const [visibleManualDetailsDialog, setVisibleManualDetailsDialog] = useState<boolean>(false);
    const [visibleApproveManualDialog, setVisibleApproveManualDialog] = useState<boolean>(false);
    const [visibleVersionHistoryDialog, setVisibleVersionHistoryDialog] = useState<boolean>(false);
    const [DM_ManualVersionID_ToCompare, setDM_ManualVersionID_ToCompare] = useState<number>(-1);
    const [IsSingleFileDiff, setIsSingleFileDiff] = useState<boolean>(false);
    const [headerText, setHeaderText] = useState<string>('Manual Details');
    const menu = useRef<ContextMenu>(null);
    const toast = useRef<Toast>(null);
    const { theme } = useTheme(); 
   
     const getJoditConfig = () => ({
        readonly: true,
        toolbar: false,
        height: 300,
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        theme: theme === 'dark' ? 'dark' : 'default',
        style: {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: '"Segoe UI", Arial, sans-serif',
            fontSize: '16px',
            lineHeight: '1.6'
        }
    });

    useEffect(() => {
        if(manualInfo.selectedManualNodeObj)
        {
            setManualID(manualInfo.selectedManualNodeObj.key ? Number(manualInfo.selectedManualNodeObj.key) : -1);
            setHeaderText(manualInfo.selectedManualNodeObj.label ?? '');
            setIsFavourite(Number(manualInfo.selectedManualNodeObj.data?.isFavourite ?? 0) > 0); // a count of favourite rows: 1 or more

            setIsManualReleased(false);
            if(manualInfo.selectedManualNodeObj?.data?.dM_StatusID === 150) {
                setIsManualReleased(manualInfo.selectedManualNodeObj.data.isActive);
            }
        }        
    }, [manualInfo.selectedManualNodeObj]);
    
    const manualKey = manualInfo.selectedManualNodeObj?.key;
    const fetchData = useCallback(() => {
        if (manualKey == null) return;
        dmsLifecycleService.getApiCall<string>(`Manuals/GetManualContent?dm_ManualID=${manualKey}&IncludeSubManuals=${isChecked}`)
            .then((manualResponse) => {
                // Shown in the editor as HTML: anything that could run code is removed first.
                setManualText(sanitizeHtml(manualResponse));
            })
            .catch(() => {
                setManualText('<p><em>Could not load this manual. Please try again.</em></p>');
            });
    }, [manualKey, isChecked]);

    // Reloaded when another manual is selected (or the same one after an edit: a new node object) or the
    // "include sub manuals" box changes.
    const selectedNode = manualInfo.selectedManualNodeObj;

    // The approval steps of this version (done / current / pending, who approved and when), for the bar above the text.
    const [progress, setProgress] = useState<ApprovalProgress | null>(null);
    const progressManualId = selectedNode?.key;
    const progressVersionId = selectedNode?.data?.dM_ManualVersionID;
    const progressStatusId = selectedNode?.data?.dM_StatusID;
    useEffect(() => {
        setProgress(null);
        if (progressManualId == null || !progressVersionId) return;
        let cancelled = false;
        dmsLifecycleService.getApiCall<ApprovalProgress>(`Manuals/GetApprovalProgress?dm_ManualID=${progressManualId}&dm_ManualVersionID=${progressVersionId}`)
            .then((p) => { if (!cancelled) setProgress(p ?? null); })
            .catch(() => { if (!cancelled) setProgress(null); }); // the simple Draft / Approval / Released steps are shown instead
        return () => { cancelled = true; };
    }, [progressManualId, progressVersionId, progressStatusId]);
    useEffect(() => {
        if (selectedNode) fetchData();
    }, [fetchData, selectedNode]);
       
    const downloadAsWordHandler = () => {
        downloadAsWord(manualText, manualInfo.selectedManualNodeObj?.data?.dM_ManualVersionID);
    };
    
    const downloadAsPDFHandler = () => {
        downloadAsPDF(manualText, manualInfo.selectedManualNodeObj?.data?.dM_ManualVersionID);
    };
 
    const contextMenuItems = [
        { label: 'PDF', icon: 'pi pi-file-pdf', command: downloadAsPDFHandler },
        { label: 'Word', icon: 'pi pi-file-word', command: downloadAsWordHandler }
    ];

    const updateManuals = async (data: ManualFormData) => {
        try {
            await dmsLifecycleService.postApiCall('Manuals/EditManual', data);

           setVisibleAddEditDialog(false);
           fetchData();
           if (onRefreshTree) onRefreshTree(); 
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The manual could not be saved.')));
        }
    }

    const ApproveManuals = async (data: ManualApprovalRequest) => {
        try {
            await dmsLifecycleService.postApiCall('Manuals/ApproveManual', data);

           setVisibleApproveManualDialog(false);
           fetchData();
           if (onRefreshTree) onRefreshTree(); 
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The manual could not be approved.')));
        }
    }

    const SendBackManuals = async (data: ManualApprovalRequest) => {
        try {
            await dmsLifecycleService.postApiCall('Manuals/SendBackManual', data);

           setVisibleApproveManualDialog(false);
           fetchData();
           if (onRefreshTree) onRefreshTree(); 
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The manual could not be sent back.')));
        }
    }

    const showCompareVersion = (data: CompareFormData) => {
        setDM_ManualVersionID_ToCompare(data.DM_ManualVersionID_ToCompare);
        setIsSingleFileDiff(data.IsSingleVersion);
        setVisibleCompareVersionDialog(false);
        setVisibleCompareVersionDetailsDialog(true);
    }

    /** The star: adds the manual to my favourites or takes it out (no question first; a message confirms it). */
    const toggleFavourite = async () => {
        const removing = isFavourite;
        const action = removing ? 'RemoveFromFavourite' : 'AddToFavourite';
        try {
            await dmsLifecycleService.postApiCall(`Manuals/${action}?dm_ManualID=${manualID}&userId=${userId}`);
            setIsFavourite(!removing);
            toast.current?.show({
                severity: 'success',
                summary: 'Favourites',
                detail: removing ? 'Manual removed from favourites.' : 'Manual added to favourites.',
                life: 3000,
                closable: true
            });
            if (onRefreshTree) onRefreshTree();
        } catch {
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: removing ? 'Failed to remove manual from favourites.' : 'Failed to add manual to favourites.',
                life: 3000,
                closable: true
            });
        }
    };

    /** Status steps: Draft, then the approval step it is in (Supt, Manager, ...), then Released. */
    const node = manualInfo.selectedManualNodeObj;
    const statusId: number = node?.data?.dM_StatusID ?? 0;
    const statusText: string = node?.data?.statusString ?? '';
    const inApproval = statusId > 100 && statusId < 150;
    const released = statusId >= 150;
    const approvalSteps: StatusStep[] = progress?.approvalRequired && progress.steps.length
        ? progress.steps.map((a) => ({
            key: `a${a.statusId}`,
            label: a.name,
            sub: a.state === 'done'
                ? [a.approvedBy, a.approvedOn ? formatDate(a.approvedOn) : ''].filter(Boolean).join(' · ') || 'Approved'
                : a.state === 'current' ? 'Waiting' : 'Not yet',
            hint: [a.role && a.dept ? `${a.role} (${a.dept})` : a.role || a.dept, a.comments ? `Comment: ${a.comments}` : ''].filter(Boolean).join('\n') || undefined,
            state: a.state,
        }))
        : progress && !progress.approvalRequired
            ? [] // no approval needed: Draft, then Released
            : [{ key: 'approval', label: inApproval && statusText ? statusText : 'Approval', state: released ? 'done' : inApproval ? 'current' : 'pending' }];
    const steps: StatusStep[] = [
        { key: 'draft', label: 'Draft', state: statusId > 100 ? 'done' : 'current' },
        ...approvalSteps,
        { key: 'released', label: 'Released', sub: released ? formatDate(node?.data?.lastUpdated) : undefined, state: released ? 'done' : 'pending' },
    ];

    /** Why Edit or Approve cannot be used right now (null when it can); shown on the button. */
    const editBlocked: string | null = !node ? 'Select a manual first'
        : (isManualReleased || statusId === 100) ? null
        : statusId >= 150 ? 'This is not the current version, so it cannot be edited.'
        : `It cannot be edited while it is waiting for ${statusText || 'approval'}. It can be edited again once it is released or sent back.`;
    const approveBlocked: string | null = !node ? 'Select a manual first'
        : isManualReleased ? 'Already released: there is nothing to approve.'
        : statusId === 100 ? 'A draft goes for approval from Edit > Publish.'
        : null;

    return (
       <div className="manuals-content">
        <Toast ref={toast} />
        <div className='sectionDiv'>
            <header className="mc-head">
                <div className="mc-head__main">
                    <h2 className="mc-title" title={node?.label ?? ''}>{node?.label || 'No manual selected'}</h2>
                    {node && (
                        <div className="mc-meta">
                            <span className="mc-tag" title="Category">{node.data?.category || 'No category'}</span>
                            <span className="mc-tag" title="Version">Version {node.data?.manualVersion || '–'}</span>
                            <span className="mc-meta__item" title="Last updated">
                                <i className="pi pi-calendar" aria-hidden="true" /> Updated {formatDate(node.data?.lastUpdated)}
                            </span>
                            {manualID > 0 && <ManualRelatedCirculars manualId={manualID} compact />}
                        </div>
                    )}
                </div>
                <div className="mc-head__tools" role="toolbar" aria-label="Manual tools">
                    <button type="button" className={`mc-icon${isFavourite ? ' is-on' : ''}`} onClick={toggleFavourite} disabled={manualID <= 0}
                        aria-pressed={isFavourite} title={isFavourite ? 'Remove from my favourites' : 'Add to my favourites'}>
                        <i className={isFavourite ? 'pi pi-star-fill' : 'pi pi-star'} aria-hidden="true" />
                    </button>
                    <button type="button" className="mc-icon" title="Manual details" aria-label="Manual details" disabled={!node}
                        onClick={() => setVisibleManualDetailsDialog(true)}>
                        <i className="pi pi-info-circle" aria-hidden="true" />
                    </button>
                    <ContextMenu model={contextMenuItems} ref={menu} style={{ minWidth: '150px' }} />
                    <button type="button" className="mc-icon" title="Download as PDF or Word" aria-label="Download" disabled={!node}
                        onClick={e => menu.current?.show(e)}>
                        <i className="pi pi-download" aria-hidden="true" />
                    </button>
                    <button type="button" className="mc-icon" title="Version history" aria-label="Version history" disabled={!node}
                        onClick={() => setVisibleVersionHistoryDialog(true)}>
                        <i className="pi pi-history" aria-hidden="true" />
                    </button>
                </div>
            </header>
            {node && (
                <div className="mc-bar">
                    <ol className="mc-steps" aria-label={`Status: ${statusText}`}>
                        {steps.map((s, i) => (
                            <li key={s.key} className={s.state === 'done' ? 'is-done' : s.state === 'current' ? 'is-current' : ''}
                                aria-current={s.state === 'current' ? 'step' : undefined} title={s.hint}>
                                <span className="mc-steps__dot" aria-hidden="true">{s.state === 'done' ? <i className="pi pi-check" /> : i + 1}</span>
                                <span className="mc-steps__text">
                                    <span className="mc-steps__label">{s.label}</span>
                                    {s.sub && <span className="mc-steps__sub">{s.sub}</span>}
                                </span>
                            </li>
                        ))}
                    </ol>
                    <div className="mc-actions">
                        <label className="mc-check" title="Show the sections below this manual in the text too">
                            <input type="checkbox" checked={isChecked} onChange={e => { setIsChecked(e.target.checked); }} />
                            Show sub-sections
                        </label>
                        <button type="button" className="mc-btn" onClick={() => setVisibleCompareVersionDialog(true)}>
                            <i className="pi pi-clone" aria-hidden="true" /> Compare versions
                        </button>
                        <span className="mc-btn-wrap" title={editBlocked ?? 'Edit this manual'}>
                            <button type="button" className="mc-btn" onClick={() => { setVisibleAddEditDialog(true); }} disabled={!!editBlocked}>
                                <i className="pi pi-pencil" aria-hidden="true" /> Edit
                            </button>
                        </span>
                        <span className="mc-btn-wrap" title={approveBlocked ?? 'Approve it, or send it back with a comment'}>
                            <button type="button" className="mc-btn mc-btn--primary" onClick={() => setVisibleApproveManualDialog(true)} disabled={!!approveBlocked}>
                                <i className="pi pi-check" aria-hidden="true" /> Approve or send back
                            </button>
                        </span>
                    </div>
                    {editBlocked && approveBlocked == null && <p className="mc-hint"><i className="pi pi-info-circle" aria-hidden="true" /> {editBlocked}</p>}
                </div>
            )}
            <div className='sectiontext mc-reader'>
                 {manualInfo.selectedManualNodeObj ? (
                    <JoditEditor
                        value={manualText}
                        config={getJoditConfig()}
                        key={theme}
                    />
                ) : (
                   <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                        Select a manual to view its content
                    </p>
                )}
            </div>
        </div>
        <Dialog header={'Compare Version'}
            visible={visibleCompareVersionDialog}
            showHeader={false}
            style={{ width: '450px', minWidth: '90vh' }}
            contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
            headerStyle={{ height: '60px', backgroundColor: '#d2e3f9ff', borderBottom: '2px solid blue' }}
            onHide={() => { if (!visibleCompareVersionDialog) return; setVisibleCompareVersionDialog(false); }}>
            <CompareVersion
                onSubmit={showCompareVersion}
                closeForm={() => setVisibleCompareVersionDialog(false)}
                selectedManualID={manualID}
            />
        </Dialog>

        <Dialog
            header={'Compare Version : ' + headerText}
            visible={visibleCompareVersionDetailsDialog}
            style={{ width: '90%', minWidth: '90vh', height: '100%' }}
            contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
            headerStyle={{ backgroundColor: '#d2e3f9ff', borderBottom: '3px solid blue' }}
            onHide={() => { if (!visibleCompareVersionDetailsDialog) return; setVisibleCompareVersionDetailsDialog(false); }}>
            {IsSingleFileDiff ? (
                 <ViewCompareManualDetails
                    closeForm={() => setVisibleCompareVersionDetailsDialog(false)}
                    manualID={manualID}
                    DM_ManualVersionID_ToCompare={DM_ManualVersionID_ToCompare}
                />
            ) : (
                <CompareVersionDetails
                    closeForm={() => setVisibleCompareVersionDetailsDialog(false)}
                    manualID={manualID}
                    DM_ManualVersionID_ToCompare={DM_ManualVersionID_ToCompare}
                />
            )}
        </Dialog>
        {visibleManualDetailsDialog && (
            <Dialog
                className="manual-details-dialog"
                header={'Manual details'}
                visible={visibleManualDetailsDialog}
                style={{ width: '1100px', maxWidth: '96vw', maxHeight: '92vh' }}
                contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
                onHide={() => { if (!visibleManualDetailsDialog) return; setVisibleManualDetailsDialog(false); }}>
                <ManualDetails 
                    closeForm={() => setVisibleManualDetailsDialog(false)}
                    dmManualVersionID={manualInfo.selectedManualNodeObj?.data?.dM_ManualVersionID} />
            </Dialog>
        )}
        {visibleApproveManualDialog && (
            <Dialog
                className="no-header-dialog"
                showHeader={false}
                visible={visibleApproveManualDialog}
                style={{ width: '550px', minWidth: '90vh' }}
                contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
                onHide={() => { if (!visibleApproveManualDialog) return; setVisibleApproveManualDialog(false); }}>
                <ApproveManual 
                    manualName={manualInfo.selectedManualNodeObj?.label ?? ''}
                    version={manualInfo.selectedManualNodeObj?.data?.manualVersion}
                    status={manualInfo.selectedManualNodeObj?.data?.statusString}
                    onApprove={(comment) => { ApproveManuals({ dM_ManualID: manualInfo.selectedManualNodeObj?.key, dM_ManualVersionID: manualInfo.selectedManualNodeObj?.data?.dM_ManualVersionID, userID: userId, comments: comment }); }}
                    onReject={(comment) => { SendBackManuals({ dM_ManualID: manualInfo.selectedManualNodeObj?.key, dM_ManualVersionID: manualInfo.selectedManualNodeObj?.data?.dM_ManualVersionID, userID: userId, comments: comment }); }}
                    onClose={() => setVisibleApproveManualDialog(false)}
                />
            </Dialog>
        )}
        {visibleAddEditDialog && (
           <Dialog header={headerText}
            className="manual-edit-dialog"
            visible={visibleAddEditDialog}
            style={{ width: 'min(1200px, 96vw)', height: '92vh' }}
            contentStyle={{ padding: '0.1rem', backgroundColor: '#e5eefbff' }}
            headerStyle={{ backgroundColor: '#d2e3f9ff', borderBottom: '3px solid blue' , height: '40px'}}
            onHide={() => { if (!visibleAddEditDialog) return; setVisibleAddEditDialog(false); }}>
                <AddEditManual
                    onSubmit={updateManuals}
                    closeForm={() => { setVisibleAddEditDialog(false); }}
                    selectedAction="Edit"
                    selectedManualID={manualInfo.selectedManualNodeObj?.data?.dM_ManualID}
                    selectedManualVersionID={manualInfo.selectedManualNodeObj?.data?.dM_ManualVersionID}
                />
            </Dialog>
        )}
        {visibleVersionHistoryDialog && (
            <Dialog
                className="manual-details-dialog"
                header={'Manual Version History Details'}
                visible={visibleVersionHistoryDialog}
                style={{ width: '1250px', minWidth: '90vh', height: '100vh', maxHeight: '95vh' }}
                contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
                onHide={() => { if (!visibleVersionHistoryDialog) return; setVisibleVersionHistoryDialog(false); }}>
                <ManualVersionHistory closeForm={() => setVisibleVersionHistoryDialog(false)} />
            </Dialog>
        )}
        </div>
    );
};

export default ManualsContent;