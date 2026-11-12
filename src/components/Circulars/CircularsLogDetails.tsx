import React, { useEffect, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import dmsLifecycleService from "../../services/DMSLifecycleService";

export interface CircularsLogProps {
    selectedCIR_MasterID: number;
}

export type CircularsLogData = {
    Logdate?: string;
    UserId?: string | number;
    UserName?: string;
    UserRole?: string;
    Activity?: string;
    Remarks?: string;
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return dateStr;
    }
};

type Fields = Record<string, unknown>;

/** The first of these fields that has a value, as text (the API has sent the log under several spellings). */
const textOf = (item: Fields, ...names: string[]): string | undefined => {
    for (const name of names) {
        const value = item[name];
        if (value != null) return String(value);
    }
    return undefined;
};

const normalizeLogResponse = (response: unknown): CircularsLogData[] => {
    const wrapper = (response && typeof response === 'object' ? response : {}) as Fields;
    const records = Array.isArray(response)
        ? response
        : wrapper.data ?? wrapper.items ?? wrapper.results ?? wrapper.$values ?? [];

    if (!Array.isArray(records)) return [];

    return (records as unknown[]).map((entry) => {
        const item = (entry && typeof entry === 'object' ? entry : {}) as Fields;
        return {
            Logdate: textOf(item, 'Logdate', 'LogDate', 'logdate', 'logDate'),
            UserId: textOf(item, 'UserId', 'UserID', 'userId', 'userID'),
            UserName: textOf(item, 'UserName', 'username', 'userName'),
            UserRole: textOf(item, 'UserRole', 'userRole'),
            Activity: textOf(item, 'Activity', 'activity'),
            Remarks: textOf(item, 'Remarks', 'remarks', 'Remark', 'remark'),
        };
    });
};

const CircularsLogDetails: React.FC<CircularsLogProps> = ({ selectedCIR_MasterID }) => {
    const [logDetails, setLogDetails] = useState<CircularsLogData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        let mounted = true;
        setLoading(true);

        dmsLifecycleService.getApiCall<unknown>(`circular/GetCircularLogs?ciR_MasterID=${selectedCIR_MasterID}`)
            .then((data) => {
                if (mounted) setLogDetails(normalizeLogResponse(data));
            })
            .catch(() => {
                if (mounted) setLogDetails([]);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [selectedCIR_MasterID]);

    return (
        <div className="manual-details circular-log-page">
            <DataTable
                value={logDetails}
                paginator
                rows={10}
                loading={loading}
                sortField="Logdate"
                sortOrder={-1}
                className="manual-list circular-log-table"
                style={{ width: '100%' }}
                tableStyle={{ minWidth: '900px' }}
                emptyMessage={
                    <span className="circular-log-empty">
                        No data found.
                    </span>
                }
            >
                <Column field="Logdate" header="Log Date" body={(row: CircularsLogData) => formatDate(row.Logdate)} sortable />
                <Column field="UserId" header="User ID" sortable />
                <Column field="UserName" header="User Name" />
                <Column field="UserRole" header="User Role" />
                <Column field="Activity" header="Activity" />
                <Column field="Remarks" header="Remarks" />
            </DataTable>
        </div>
    );
};

export default CircularsLogDetails;