import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import { ContextMenu } from 'primereact/contextmenu';
import { setError } from '../../../store/slices/appSlice';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { Button } from 'primereact/button';
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
    const [showConfirmPopup, setShowConfirmPopup] = useState(false);
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
            setIsFavourite(manualInfo.selectedManualNodeObj.data.isFavourite ? manualInfo.selectedManualNodeObj.data.isFavourite === 1 ? true : false : false);

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

    const checkConfirmation = () => {
        setShowConfirmPopup(true);
    };

    const CustomConfirmDialog = () => {
        if (!showConfirmPopup) return null;
        return (
            <div className="confirm-overlay">
                <div className="confirm-popup">
                    <div className="confirm-header">
                        <i className="pi pi-exclamation-triangle" /> Confirmation
                    </div>
                    <div className="confirm-content">
                        Are you sure you want to {isFavourite ? 'remove this manual from' : 'add this manual to'} favourites?
                    </div>
                    <div className="confirm-actions">
                        <button 
                            className="confirm-button confirm-yes" 
                            onClick={() => {
                                setShowConfirmPopup(false);
                                accept();
                            }}
                        >
                            Yes
                        </button>
                        <button 
                            className="confirm-button confirm-no" 
                            onClick={() => {
                                setShowConfirmPopup(false);
                                reject();
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const accept = async () => {
        const removing = isFavourite;
        const action = removing ? 'RemoveFromFavourite' : 'AddToFavourite';
        try {
            await dmsLifecycleService.postApiCall(`Manuals/${action}?dm_ManualID=${manualID}&userId=${userId}`);
            setIsFavourite(!removing);
            toast.current?.show({
                severity: 'success',
                summary: 'Confirmed',
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

    const reject = () => {
        toast.current?.show({
            severity: 'warn',
            summary: 'Rejected',
            detail: 'You have rejected add favourite',
            life: 3000,
            closable: true
        });
    }
    
    return (
       <div className="manuals-content" style={{ overflowY: 'auto' }}>
        <Toast ref={toast} />
        <div className='sectionDiv'>
            <div className='selectedTextDiv'>
                <div className="left-section" style={{flexDirection: 'row' }}>
                    <div style={{flexDirection: 'row', display: 'inline-flex', alignItems: 'left', verticalAlign: 'middle'}}>
                        <span className='selectedText' >Selected Manual :&nbsp;</span>
                    </div>
                    <div style={{flexDirection: 'row', display: 'inline-flex', alignItems: 'left', verticalAlign: 'middle'}}>
                        <label className='selectedTextHighlight'
                        title={
                            manualInfo.selectedManualNodeObj
                            ? manualInfo.selectedManualNodeObj.label
                            : ''
                          }
                        >
                        {manualInfo.selectedManualNodeObj
                            ? manualInfo.selectedManualNodeObj.label
                            : ''}
                        </label>
                    </div>
                </div>
                <div className="right-section">
                    <button
                        type="button"
                        className="info-icon-btn"
                        title="Manual details"
                        aria-label="Manual details"
                        onClick={() => setVisibleManualDetailsDialog(true)}
                    >
                        <i className="pi pi-info-circle" aria-hidden="true" />
                    </button>
                    <ContextMenu model={contextMenuItems} ref={menu} style={{ minWidth: '150px' }} />
                    <button
                        type="button"
                        className="download-icon-btn"
                        title="Download Manual"
                        onClick={e => menu.current?.show(e)}
                    >
                        <img src="/download1.png" alt="Download" className="download-icon" />
                    </button>
                    <Button
                        icon="pi pi-history"
                        rounded
                        tooltip="Version History"
                        onClick={() => setVisibleVersionHistoryDialog(true)}
                        severity="info"
                         style={{
                            fontSize: '1rem',
                            whiteSpace: 'nowrap',
                            height: '2.5rem',
                            lineHeight: '1.2rem'
                        }}
                    />
                    <Button
                        icon={isFavourite ? "pi pi-star-fill" : "pi pi-star"}
                        label={isFavourite ? "Remove from Favourite" : "Add to Favourite"}
                        className={`p-button-rounded p-button-lg ${isFavourite ? 'p-button-danger' : 'p-button-warning'}`}
                        style={{
                            fontSize: '1rem',
                            minWidth: 170,
                            whiteSpace: 'nowrap',
                            height: '2.5rem', 
                            lineHeight: '1.2rem'
                        }}
                        onClick={checkConfirmation}
                        disabled={manualID <= 0}
                    />
                </div>
            </div>
            {manualID > 0 && <ManualRelatedCirculars manualId={manualID} />}
            <div style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{flexDirection: 'row'}}>
                    { manualInfo.selectedManualNodeObj &&
                         <div className="header-meta" style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '4px' }}>
                            <span className="badge category-badge"
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '20px',
                                    fontSize: '0.875rem',
                                    fontWeight: '600',
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                {manualInfo.selectedManualNodeObj.data?.category || ' -- '}
                            </span>
                            <span className="badge version-badge"
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '20px',
                                    fontSize: '0.875rem',
                                    fontWeight: '600',
                                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                Version {manualInfo.selectedManualNodeObj.data?.manualVersion || ' -- '}
                            </span>
                            <span className="update-date">
                                <i className="pi pi-calendar"></i>
                                Last updated: {formatDate(manualInfo.selectedManualNodeObj.data?.lastUpdated)}
                            </span>
                        </div>
                    }
                    <div className="header-meta" style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', fontSize: '16px', display:'inline-flex' }}>Status :&nbsp;</span>
                        <span style={{ fontWeight: 'bold', fontSize: '18px', fontStyle:'bold', width:'300px', display:'inline-flex' }}>
                        {manualInfo.selectedManualNodeObj
                            ? manualInfo.selectedManualNodeObj.data.statusString
                            : ''}
                        </span>

                        <label style={{ marginLeft: '5px', width: '220px', display: 'inline-block', fontSize: '18px', fontStyle:'normal' }}>
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => { setIsChecked(e.target.checked); }}
                                className="large-checkbox"
                                style={{ marginLeft: '6px', marginRight: '4px', verticalAlign: 'middle' }}
                            />
                            Include Sub Manual
                        </label>
                    </div>
                </div>
                <div style={{flexDirection: 'row', display: 'block', alignItems: 'right'}}>
                    <button
                        className="manual-action-btn"
                        onClick={() => setVisibleCompareVersionDialog(true)}
                        type="button"
                    >
                        Compare Version
                    </button>
                    <button
                        className="manual-action-btn"
                        onClick={() => { setVisibleAddEditDialog(true); }}
                        type="button"
                        style={{ width: '100px', marginRight: '8px' }}
                        disabled = {!isManualReleased && manualInfo.selectedManualNodeObj?.data?.dM_StatusID !== 100}
                    >
                        Edit
                    </button>
                    <button
                        className="manual-action-btn"
                        onClick={() => setVisibleApproveManualDialog(true)}
                        type="button"
                        style={{ width:'120px'}}
                        disabled = {isManualReleased || manualInfo.selectedManualNodeObj?.data?.dM_StatusID === 100}
                    >
                        Approve
                    </button>
                </div>
            </div>
            <div className='sectiontext'>
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
                header={'Manual Details '}
                visible={visibleManualDetailsDialog}
                style={{ width: '1250px', minWidth: '90vh', height: '100vh', maxHeight: '95vh' }}
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
            style={{ width: '60%', height: '220vh' }}
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
        {showConfirmPopup && <CustomConfirmDialog />}
        </div>
    );
};

export default ManualsContent;