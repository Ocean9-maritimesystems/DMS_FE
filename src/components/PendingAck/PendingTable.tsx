import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { AckPendingRow } from '../../types/api';
import { itemIcon, itemLink } from '../../config/itemLinks';
import { formatDate } from '../utils/formatDate';

interface PendingTableProps {
    rows: AckPendingRow[];
    loading: boolean;
    /** Show the vessel column (vessel lists across several vessels). */
    showVessel?: boolean;
    /** "Rank" for crew, "Role" for office users. */
    whoLabel?: string;
    emptyMessage: string;
}

/** The items people still have to acknowledge, overdue first (the API sorts by due date). */
const PendingTable: React.FC<PendingTableProps> = ({ rows, loading, showVessel = false, whoLabel = 'Rank', emptyMessage }) => {
    const [first, setFirst] = useState(0);

    useEffect(() => {
        setFirst(0);
    }, [rows]);

    const itemTemplate = (row: AckPendingRow) => {
        const link = itemLink(row.itemType, row.itemID);
        const label = (
            <>
                {row.number && <span className="pa-number">{row.number}</span>}
                <span>{row.title || `${row.itemType} ${row.itemID}`}</span>
            </>
        );
        return (
            <div className="pa-item">
                <i className={itemIcon(row.itemType)} aria-hidden="true" title={row.itemType} />
                <div className="pa-item-text">
                    {link ? <Link to={link}>{label}</Link> : label}
                    <span className="pa-item-type">
                        {row.itemType}
                        {row.version ? ` · version ${row.version}` : ''}
                    </span>
                </div>
            </div>
        );
    };

    const whoTemplate = (row: AckPendingRow) => (
        <div className="pa-who">
            <span>{row.userName || row.userID || '—'}</span>
            <span className="pa-sub">
                {[row.rank, row.dept].filter(Boolean).join(' · ')}
            </span>
        </div>
    );

    const dueTemplate = (row: AckPendingRow) => (
        <div className="pa-due">
            <span>{formatDate(row.dueOn)}</span>
            {row.overdue ? (
                <span className="pa-badge pa-badge-overdue">Overdue</span>
            ) : (
                <span className="pa-sub">{row.daysWaiting} day{row.daysWaiting === 1 ? '' : 's'} waiting</span>
            )}
        </div>
    );

    return (
        <DataTable
            value={rows}
            loading={loading}
            paginator={rows.length > 25}
            first={first}
            onPage={(event) => setFirst(event.first)}
            rows={25}
            rowsPerPageOptions={[25, 50, 100]}
            emptyMessage={emptyMessage}
            rowClassName={(row: AckPendingRow) => (row.overdue ? 'pa-row-overdue' : '')}
            className="pa-table"
            size="small"
            stripedRows
            responsiveLayout="stack"
            breakpoint="760px"
            sortMode="single"
        >
            <Column header="Item" body={itemTemplate} sortable sortField="title" style={{ minWidth: '16rem' }} />
            {showVessel && <Column field="vesselName" header="Vessel" sortable style={{ minWidth: '9rem' }} />}
            <Column header={`Person / ${whoLabel}`} body={whoTemplate} sortable sortField="userName" style={{ minWidth: '11rem' }} />
            <Column header="Released" body={(row: AckPendingRow) => formatDate(row.releasedOn)} sortable sortField="releasedOn" />
            <Column header="Due" body={dueTemplate} sortable sortField="dueOn" />
        </DataTable>
    );
};

export default PendingTable;
