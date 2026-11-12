import React, { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './ManualAckList.scss';

export interface ackProps {
    dm_ManualID: number;
    closeForm: () => void;
}

export interface ackDetails {
    vslCode: string;
    vslName: string;
    userID: string;
    userName: string;
    userRank: string;
    version: string;
    dateRead: Date;
    comments: string;
    dm_ManualID: number;
    dm_ManualVersionID: number;
    vesselID: string;
}

// closeForm: the dialog around this list closes itself (its X), nothing to close from here.
const ManualAckList: React.FC<ackProps> = ({ dm_ManualID }) => {
    const [ackManualData, setAckManualData] = useState<ackDetails[]>([]);

    useEffect(() => {
        dmsLifecycleService.getApiCall<ackDetails[] | null>(`Manuals/GetManualUserAckList/${dm_ManualID}`)
                .then((data) => {
                    setAckManualData(data || []);
                })
                .catch(() => {
                    setAckManualData([]);
                });
    }, [dm_ManualID]);

    const formatDate = (date: Date | string) => {
        if (!date) return '-';
        return new Date(date).toLocaleString();
    };
    
    return (
        <div className="manual-details manual-ack-page">
            <div className="ack-page-header">
                <div>
                    <span className="ack-page-kicker">User Acknowledgements</span>
                    <p>Review the vessels and users who have acknowledged this manual.</p>
                </div>
                <div className="ack-total">
                    <strong>{ackManualData.length}</strong>
                    <span>Records</span>
                </div>
            </div>
            <DataTable
                value={ackManualData}
                paginator
                rows={10}  
                emptyMessage={
                    <span className="ack-empty-message">
                        No data found.
                    </span>
                }
                className="manual-list ack-table"
                style={{ width: '100%' }}
                tableStyle={{ minWidth: '980px' }}>
                <Column field="vslCode" header="Vessel Code" style={{width: '150px'}} />
                <Column field="vslName" header="Vessel Name" style={{width: '150px'}} />
                <Column field="userID" header="User ID" style={{width: '150px'}} />
                <Column field="userName" header="User Name" style={{width: '150px'}} />
                <Column field="userRank" header="User Rank" style={{width: '150px'}} />
                <Column field="version" header="Version" style={{width: '150px'}} />
                <Column field="dateRead" header="Date Read" style={{width: '180px'}} body={(rowData) => formatDate(rowData.dateRead)} />
                <Column field="comments" header="Comments" style={{width: '150px'}} />
            </DataTable>
            </div>
    );
}
export default ManualAckList;
