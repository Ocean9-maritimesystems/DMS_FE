import React, { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import ManualDetails from './ManualDetails';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './UserManualList.scss';

export interface UserManualProps {
    userId: string;
    callMode: string; // "PendingMyApproval" | "PendingMyReview" | "PendingMyAcknowledgement" | "NewDocuments" | "Favourites" | "ManualInfo"
}

export interface userDetails {
    categoryName: string;
    manualCode: string;
    manualName: string;
    version: string;
    statusString: string;
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
    dm_ManualID: string;
    dm_ManualVersionID: string;
}

const UserManualList: React.FC<UserManualProps> = ({callMode, userId}) => {
    const [visibleManualDetailsDialog, setVisibleManualDetailsDialog] = useState<boolean>(false);
    const [dm_ManualVersionID, setDm_ManualVersionID] = useState<number>(-1);
    const [isLoading, setIsLoading] = useState(true);
  
    const [usersManualData, setUsersManualData] = useState<userDetails[]>([]);
    
    useEffect(() => {
        // A failed load shows an empty list (before, the list stayed on "loading" for ever).
        dmsLifecycleService.getApiCall<userDetails[] | null>(`Manuals/GetUserManualListForCalledMode?userID=${userId}&calledMode=${callMode}`)
            .then((data) => setUsersManualData(data || []))
            .catch(() => setUsersManualData([]))
            .finally(() => setIsLoading(false));
    }, [userId, callMode]);
    
    const callManualDetails = (dm_ManualVersionID: number) => {
      setDm_ManualVersionID(dm_ManualVersionID) 
      setVisibleManualDetailsDialog(true)
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';

        return dateStr.split('T')[0]; // Returns only the date part
    };

    return (
        <div className="manual-details">
            <DataTable 
                value={usersManualData} 
                paginator
                rows={10}  
                scrollable
                emptyMessage={
                    <span style={{ display: 'block', width: '100%', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        {isLoading ? 'Loading...' : 'No data found.'}
                    </span>
                }
                className="manual-list p-datatable-gridlines"
                style={{ width: '100%' }}
                tableStyle={{ tableLayout: 'fixed' }}
                >
                <Column field="viewManualLink" header="#" style={{ width: '60px' }} body={(rowData) => (
                    <a href={rowData.viewManualLink} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       onClick={(e) => {
                            e.preventDefault();
                            callManualDetails(rowData.dM_ManualVersionID);
                        }}>View
                    </a>
                )} />
                <Column field="categoryName" header="Category" style={{width: '150px'}} />
                <Column field="manualCode" header="Manual Code" style={{width: '80px'}} />
                <Column field="manualName" header="Manual Name" style={{width: '500px'}} />
                <Column field="version" header="Version" style={{width: '80px'}} />
                <Column field="statusString" header="Status" style={{width: '150px'}} />
                <Column field="isApprovalRequired" header="Approval Required" style={{width: '90px'}} />
                <Column field="canExport" header="Can Export" style={{width: '80px'}} />
                <Column field="isAcknowledgementRequired" header="Ack Required" style={{width: '90px'}} />
                <Column field="createdBy" header="Created By" style={{width: '120px'}} />
                <Column field="createdDate" header="Created Date" style={{width: '100px'}} body={rowData => formatDate(rowData.createdDate)} />
                <Column field="releasedBy" header="Released By" style={{width: '120px'}} />
                <Column field="releasedDate" header="Released Date" style={{width: '100px'}} body={rowData => formatDate(rowData.releasedDate)} />
                <Column field="publishedBy" header="Published By" style={{width: '120px'}} />
                <Column field="publishedDate" header="Published Date" style={{width: '110px'}} body={rowData => formatDate(rowData.publishedDate)} />
                <Column field="lastModifiedBy" header="Last Modified By" style={{width: '120px'}} />
                <Column field="lastModifiedDate" header="Last Modified Date" style={{width: '110px'}} body={rowData => formatDate(rowData.lastModifiedDate)} />
                <Column field="comments" header="Comments" style={{width: '250px'}} />
                {/* <Column field="dM_ManualID" header="ID" style={{width: '1px'}} />
                <Column field="dM_ManualVersionID" header="ID" style={{width: '0px'}} /> */}
            </DataTable>

            {visibleManualDetailsDialog && (
                <Dialog
                    header={'Manual Details '}
                    visible={visibleManualDetailsDialog}
                    style={{ width: '1550px', minWidth: '90vh' }}
                    contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
                    headerStyle={{
                        backgroundColor: '#d2e3f9ff',
                        borderBottom: '3px solid blue',
                        height: '50px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}
                    onHide={() => { if (!visibleManualDetailsDialog) return; setVisibleManualDetailsDialog(false); }}>
                    <ManualDetails 
                        closeForm={() => setVisibleManualDetailsDialog(false)}
                        dmManualVersionID={dm_ManualVersionID} />
                </Dialog>
            )}
        </div>
    );
}
export default UserManualList;
