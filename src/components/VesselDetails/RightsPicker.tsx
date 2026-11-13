import React, { useMemo, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dropdown } from 'primereact/dropdown';

/**
 * One of the three lists in "Assign manual rights" (vessels, ranks on board, office users): a search box, optional
 * filters, a "Selected only" switch and a count of what is ticked.
 *
 * The rows shown are worked out from the full list each time (search + filters + "selected only"), so ticking a row no
 * longer clears the search. Ticking or "select all" only changes the rows on screen: rows hidden by the search or a
 * filter keep their tick.
 */
export interface PickerFilter<T> {
    id: string;
    label: string;
    placeholder: string;
    options: { label: string; value: string }[];
    match: (row: T, value: string) => boolean;
}

export interface PickerColumn {
    field: string;
    header: string;
    className?: string;
}

interface RightsPickerProps<T> {
    title: string;
    icon: string;
    /** "vessel" / "rank" / "user": for the counts and messages. */
    noun: string;
    rows: T[];
    dataKey: string;
    rowKey: (row: T) => string | number;
    columns: PickerColumn[];
    filters?: PickerFilter<T>[];
    searchText: (row: T) => string;
    selected: T[];
    onChange?: (rows: T[]) => void;
    isViewMode?: boolean;
    loading?: boolean;
}

function RightsPicker<T extends object>({
    title, icon, noun, rows, dataKey, rowKey, columns, filters = [], searchText, selected, onChange, isViewMode, loading,
}: RightsPickerProps<T>) {
    const [search, setSearch] = useState('');
    const [filterValues, setFilterValues] = useState<Record<string, string | null>>({});
    const [selectedOnly, setSelectedOnly] = useState(false);

    const selectedKeys = useMemo(() => new Set(selected.map(rowKey)), [selected, rowKey]);
    const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) =>
            (!q || searchText(r).toLowerCase().includes(q))
            && filters.every((f) => !filterValues[f.id] || f.match(r, filterValues[f.id] as string))
            && (!(selectedOnly || isViewMode) || selectedKeys.has(rowKey(r))));
    }, [rows, search, searchText, filters, filterValues, selectedOnly, isViewMode, selectedKeys, rowKey]);

    /** The ticks on screen replace those of the visible rows; hidden rows keep theirs. */
    const changeSelection = (onScreen: T[]) => {
        if (isViewMode || !onChange) return;
        const visibleKeys = new Set(visible.map(rowKey));
        const kept = selected.filter((r) => !visibleKeys.has(rowKey(r)));
        onChange([...kept, ...onScreen.filter((r) => visibleKeys.has(rowKey(r)))]);
    };

    const filtering = !!search.trim() || filters.some((f) => filterValues[f.id]);

    return (
        <div className="rp">
            <div className="rp-head">
                <span className="rp-head__icon" aria-hidden="true"><i className={icon} /></span>
                <span className="rp-head__title">{title}</span>
                <span className={`rp-count${selected.length ? ' is-some' : ''}`} title={`${plural(selected.length)} selected`}>
                    {selected.length} of {rows.length}
                </span>
                {!isViewMode && (
                    <div className="rp-head__tools">
                        <button type="button" className={`rp-link${selectedOnly ? ' is-on' : ''}`} aria-pressed={selectedOnly}
                            onClick={() => setSelectedOnly((v) => !v)} disabled={!selected.length && !selectedOnly}>
                            Selected only
                        </button>
                        {selected.length > 0 && (
                            <button type="button" className="rp-link" onClick={() => onChange?.([])} title={`Untick all ${plural(selected.length)}`}>
                                Clear
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="rp-tools">
                <span className="rp-search">
                    <i className="pi pi-search" aria-hidden="true" />
                    <input type="search" className="p-inputtext p-component" placeholder={`Search ${noun}s…`} aria-label={`Search ${noun}s`}
                        value={search} onChange={(e) => setSearch(e.target.value)} />
                </span>
                {filters.map((f) => (
                    <Dropdown key={f.id} className="rp-filter" value={filterValues[f.id] ?? null} options={f.options} placeholder={f.placeholder}
                        aria-label={f.label} showClear onChange={(e) => setFilterValues((v) => ({ ...v, [f.id]: e.value ?? null }))} />
                ))}
            </div>

            <div className="rp-table">
                <DataTable
                    value={visible}
                    loading={loading}
                    selection={selected}
                    onSelectionChange={isViewMode ? undefined : (e) => changeSelection(e.value as T[])}
                    selectionMode="checkbox"
                    dataKey={dataKey}
                    scrollable
                    scrollHeight="flex"
                    size="small"
                    emptyMessage={loading ? 'Loading…'
                        : (selectedOnly || isViewMode) && !filtering ? `No ${noun}s selected.`
                        : `No ${noun}s match.`}
                    className="vessel-rank-list"
                >
                    <Column
                        selectionMode="multiple"
                        headerClassName="rp-col-check"
                        className="rp-col-check"
                        body={isViewMode ? ((row: T) => <input type="checkbox" checked={selectedKeys.has(rowKey(row))} disabled aria-label="Selected" />) : undefined}
                    />
                    {columns.map((c) => (
                        <Column key={c.field} field={c.field} header={c.header} sortable className={c.className} headerClassName={c.className} />
                    ))}
                </DataTable>
            </div>
        </div>
    );
}

export default RightsPicker;
