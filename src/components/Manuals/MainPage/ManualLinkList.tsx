import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { setSelectedManualNodeObj } from '../../../store/slices/appSlice';
import dmsLifecycleService, { errorMessage } from '../../../services/DMSLifecycleService';
import notify from '../../../services/notify';

/**
 * "List grid" setting: shown in place of the tree when a manual link is active.
 * Lists only the manuals that match the link (no parents) and opens the selected one
 * in the content panel, the same way selecting it in the tree does.
 */
interface ManualLinkListProps {
    userId: string;
    /** Link key (?mode=), e.g. new, userfavorites, vsltoack. */
    calledMode: string;
    onFavoritesChanged: () => void;
}

/** Tree node shape returned by DMS/GetTreeViewManualList (the content panel expects this shape). */
interface ManualNode {
    key: string | number;
    label: string;
    selectable?: boolean;
    data: {
        dM_ManualID: number;
        dM_ManualVersionID: number;
        manualVersion: string;
        statusString: string;
        category: string;
        lastUpdated: string;
        isMatch?: boolean;
        [k: string]: unknown;
    };
    children?: ManualNode[];
}

/** Flattens the filtered tree to the matching manuals only (parents shown for context are left out). */
const flattenMatches = (nodes: ManualNode[]): ManualNode[] => {
    const rows: ManualNode[] = [];
    const walk = (list: ManualNode[]) => {
        list.forEach((n) => {
            if (n.selectable !== false && n.data?.isMatch !== false) rows.push(n);
            if (n.children?.length) walk(n.children);
        });
    };
    walk(nodes || []);
    return rows;
};

const ManualLinkList: React.FC<ManualLinkListProps> = ({ userId, calledMode, onFavoritesChanged }) => {
    const dispatch = useDispatch();
    const isFavorites = calledMode === 'userfavorites';
    const [rows, setRows] = useState<ManualNode[]>([]);
    const [selected, setSelected] = useState<ManualNode | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setSearch('');
        dmsLifecycleService
            .getApiCall(`Manuals/GetTreeViewManualList?userId=${userId}&calledMode=${encodeURIComponent(calledMode)}`)
            .then((data: ManualNode[]) => {
                if (cancelled) return;
                const list = flattenMatches(data);
                setRows(list);
                // Open the first manual, as the filtered tree does.
                const first = list[0] ?? null;
                setSelected(first);
                dispatch(setSelectedManualNodeObj(first));
            })
            .catch(() => {
                if (!cancelled) setRows([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId, calledMode, dispatch]);

    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(
            (r) =>
                r.label?.toLowerCase().includes(term) ||
                r.data?.category?.toLowerCase().includes(term) ||
                r.data?.statusString?.toLowerCase().includes(term)
        );
    }, [rows, search]);

    const onSelect = (row: ManualNode | null) => {
        if (!row) return; // keep the current manual open when the selected row is clicked again
        setSelected(row);
        dispatch(setSelectedManualNodeObj(row));
    };

    const removeFromFavourites = (row: ManualNode) => {
        confirmDialog({
            header: 'Remove from favourites?',
            message: `Remove "${row.label}" from your favourites?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Remove',
            rejectLabel: 'Cancel',
            acceptClassName: 'p-button-danger',
            accept: async () => {
                try {
                    await dmsLifecycleService.postApiCall(
                        `Manuals/RemoveFromFavourite?dm_ManualID=${row.data.dM_ManualID}&userId=${encodeURIComponent(userId)}`
                    );
                    notify.success('Manual removed from your favourites.');
                    onFavoritesChanged();
                } catch (err) {
                    notify.error(errorMessage(err), 'Could not remove manual from favourites');
                }
            }
        });
    };

    const manualBody = (row: ManualNode) => (
        <div className="link-list-manual">
            <span className="link-list-name">{row.label}</span>
            <span className="link-list-category">{row.data?.category}</span>
        </div>
    );

    return (
        <div className="manual-link-list">
            <ConfirmDialog />
            {isFavorites && (
                <div className="link-list-heading">
                    <span className="link-list-heading-icon"><i className="pi pi-star-fill" aria-hidden="true" /></span>
                    <div>
                        <h2>My favourites</h2>
                        <p>Quick access to the manuals you’ve saved.</p>
                    </div>
                    <span className="link-list-heading-count">{loading ? '—' : rows.length}</span>
                </div>
            )}
            <div className="link-list-search">
                <span className="link-list-search-box">
                    <i className="pi pi-search" />
                    <InputText
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        aria-label="Search manuals"
                    />
                </span>
                <span className="link-list-count">{loading ? '' : `${visibleRows.length} of ${rows.length}`}</span>
            </div>
            <DataTable
                value={visibleRows}
                dataKey="key"
                selectionMode="single"
                selection={selected}
                onSelectionChange={(e) => onSelect(e.value as ManualNode | null)}
                metaKeySelection={false}
                loading={loading}
                scrollable
                scrollHeight="flex"
                size="small"
                stripedRows
                className="link-list-table"
                emptyMessage={loading ? 'Loading...' : 'No manuals for this link.'}
            >
                <Column header="Manual" body={manualBody} />
                <Column field="data.manualVersion" header="Ver." style={{ width: '56px' }} />
                <Column field="data.statusString" header="Status" style={{ width: '96px' }} />
                {isFavorites && (
                    <Column
                        header="Action"
                        body={(row: ManualNode) => (
                            <Button
                                type="button"
                                icon="pi pi-star-fill"
                                className="p-button-text p-button-rounded p-button-danger link-list-remove"
                                aria-label={`Remove ${row.label} from favourites`}
                                tooltip="Remove from favourites"
                                tooltipOptions={{ position: 'top' }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeFromFavourites(row);
                                }}
                            />
                        )}
                        style={{ width: '58px' }}
                    />
                )}
            </DataTable>
        </div>
    );
};

export default ManualLinkList;
