import React, { useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Skeleton } from 'primereact/skeleton';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './DocumentVesselList.scss';

interface VesselListProps {
    /** Called with the chosen vessel (one at a time), or an empty list when none. */
    onSelectionChange?: (selected: Vessel[]) => void;
    selectedVesselId?: number | null;
    /** "All vessels" (the documents report for the whole fleet) is selected. */
    allSelected?: boolean;
    /** Shows the "All vessels" entry at the top of the list. */
    onAllVessels?: () => void;
}

export interface Vessel {
    vesselID: number;
    vslName: string;
    vslType: string;
    vslCode?: string;
}

/** The vessels as a compact, searchable list on the left of the Other Documents tab. */
const DocumentVesselList: React.FC<VesselListProps> = ({ onSelectionChange, selectedVesselId, allSelected, onAllVessels }) => {
    const [loading, setLoading] = useState(true);
    const [vessels, setVessels] = useState<Vessel[]>([]);
    const [typeOptions, setTypeOptions] = useState<{ label: string; value: string }[]>([]);
    const [vesselType, setVesselType] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(selectedVesselId ?? null);

    useEffect(() => { setSelectedId(selectedVesselId ?? null); }, [selectedVesselId]);

    useEffect(() => {
        let alive = true;
        dmsLifecycleService.getApiCall('Vessel/GetVslType')
            .then((types: string[]) => { if (alive) setTypeOptions((types || []).map((t) => ({ label: t, value: t }))); })
            .catch(() => { if (alive) setTypeOptions([]); });
        dmsLifecycleService.getApiCall('Vessel/GetVessels')
            .then((data: Vessel[]) => { if (alive) setVessels(data || []); })
            .catch(() => { if (alive) setVessels([]); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return vessels
            .filter((v) => !vesselType || (v.vslType || '').toUpperCase() === vesselType.toUpperCase())
            .filter((v) => !q || `${v.vslName} ${v.vslCode ?? ''} ${v.vslType ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => (a.vslName || '').localeCompare(b.vslName || ''));
    }, [vessels, vesselType, search]);

    const choose = (v: Vessel) => {
        const next = selectedId === v.vesselID ? null : v.vesselID;
        setSelectedId(next);
        onSelectionChange?.(next ? [v] : []);
    };

    return (
        <aside className="od-vessels" aria-label="Vessels">
            <div className="od-vessels__head">
                <h3>Vessels</h3>
                <span className="od-count">{shown.length}</span>
            </div>
            <span className="od-search od-vessels__search">
                <i className="pi pi-search" />
                <input className="p-inputtext p-component" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a vessel" aria-label="Find a vessel" />
            </span>
            {typeOptions.length > 0 && (
                <Dropdown value={vesselType} options={typeOptions} onChange={(e) => setVesselType(e.value)}
                    placeholder="All vessel types" showClear className="od-vessels__type" />
            )}
            <ul className="od-vessels__list" role="listbox" aria-label="Vessel list">
                {onAllVessels && (
                    <li
                        role="option"
                        aria-selected={!!allSelected}
                        tabIndex={0}
                        className={`od-vessel od-vessel--all${allSelected ? ' is-selected' : ''}`}
                        onClick={onAllVessels}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAllVessels(); } }}
                    >
                        <i className="pi pi-globe od-vessel__icon" aria-hidden="true" />
                        <span className="od-vessel__text">
                            <span className="od-vessel__name">All vessels</span>
                            <span className="od-vessel__meta">Documents register</span>
                        </span>
                        {allSelected && <i className="pi pi-chevron-right od-vessel__chev" aria-hidden="true" />}
                    </li>
                )}
                {loading && [0, 1, 2, 3, 4].map((i) => <li key={i} className="od-vessel"><Skeleton height="2.2rem" /></li>)}
                {!loading && shown.length === 0 && <li className="od-vessels__empty">No vessel found.</li>}
                {!loading && shown.map((v) => (
                    <li
                        key={v.vesselID}
                        role="option"
                        aria-selected={selectedId === v.vesselID}
                        tabIndex={0}
                        className={`od-vessel${selectedId === v.vesselID ? ' is-selected' : ''}`}
                        onClick={() => choose(v)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(v); } }}
                    >
                        <i className="pi pi-flag od-vessel__icon" aria-hidden="true" />
                        <span className="od-vessel__text">
                            <span className="od-vessel__name">{v.vslName}</span>
                            <span className="od-vessel__meta">{[v.vslCode, v.vslType].filter(Boolean).join(' · ')}</span>
                        </span>
                        {selectedId === v.vesselID && <i className="pi pi-chevron-right od-vessel__chev" aria-hidden="true" />}
                    </li>
                ))}
            </ul>
        </aside>
    );
};

export default DocumentVesselList;
