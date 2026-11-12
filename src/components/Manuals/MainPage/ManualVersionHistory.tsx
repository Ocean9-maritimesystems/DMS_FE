import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Tag } from "primereact/tag";
import { RootState } from "../../../store/store";
import dmsLifecycleService, { errorMessage } from "../../../services/DMSLifecycleService";
import { formatDateTime } from "../../utils/formatDate";
import '../ViewManuals/UserManualList.scss';

export interface ManualDetailsProps {
    closeForm: () => void;
}

export type ManualVersionHistoryData = {
    dM_ManualVersionID: number;
    versionNumber: string;
    createdBy?: string;
    createdDate?: string;
    publishedBy?: string;
    publishedDate?: string;
    releasedBy?: string;
    releasedDate?: string;
    isActive?: boolean;
};

/** Real version history of the selected manual (previously hard-coded sample data). */
const ManualVersionHistory: React.FC<ManualDetailsProps> = () => {
    const manualId = useSelector((state: RootState) => state.appInfo.selectedManualNodeObj?.key);
    const [rows, setRows] = useState<ManualVersionHistoryData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!manualId) return;
        setLoading(true);
        setError(null);
        dmsLifecycleService
            .getApiCall(`Manuals/GetManualVersionHistory?dm_ManualID=${manualId}`)
            .then((data: ManualVersionHistoryData[]) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => {
                setRows([]);
                setError(errorMessage(err));
            })
            .finally(() => setLoading(false));
    }, [manualId]);

    return (
        <div className="manual-details version-history-details">
            <DataTable
                value={rows}
                paginator={rows.length > 10}
                rows={10}
                loading={loading}
                emptyMessage={error ?? 'No versions found for this manual.'}
                className="manual-list version-history-table"
                style={{ width: '100%' }}
            >
                <Column
                    header="Version"
                    body={(row: ManualVersionHistoryData) => (
                        <span>
                            {row.versionNumber} {row.isActive && <Tag value="Current" severity="success" style={{ marginLeft: 6 }} />}
                        </span>
                    )}
                />
                <Column field="createdBy" header="Created by" />
                <Column header="Created" body={(row: ManualVersionHistoryData) => formatDateTime(row.createdDate)} />
                <Column field="publishedBy" header="Published by" />
                <Column header="Published" body={(row: ManualVersionHistoryData) => formatDateTime(row.publishedDate)} />
                <Column field="releasedBy" header="Released by" />
                <Column header="Released" body={(row: ManualVersionHistoryData) => formatDateTime(row.releasedDate)} />
            </DataTable>
        </div>
    );
};

export default ManualVersionHistory;
