import React, { useEffect, useMemo, useState } from 'react';
import { Vessel } from './VesselDetails';
import RightsPicker from './RightsPicker';
import dmsLifecycleService from '../../services/DMSLifecycleService';

interface VesselListProps {
    vessels: Vessel[];
    selectedVesselIdList?: number[];
    /** The selected vessels (rows, not IDs). */
    onSelectionChange?: (selected: Vessel[]) => void;
    isViewMode?: boolean;
}

const keyOf = (v: Vessel) => v.vesselID;
const textOf = (v: Vessel) => `${v.vslName ?? ''} ${v.vslType ?? ''}`;

const VesselList: React.FC<VesselListProps> = ({ vessels, selectedVesselIdList, onSelectionChange, isViewMode }) => {
    const [typeOptions, setTypeOptions] = useState<{ label: string; value: string }[]>([]);

    useEffect(() => {
        dmsLifecycleService.getApiCall<string[] | null>('Vessel/GetVslType')
            .then((data) => setTypeOptions((data || []).map((t) => ({ label: t, value: t }))))
            .catch(() => setTypeOptions([]));
    }, []);

    const selected = useMemo(() => vessels.filter((v) => selectedVesselIdList?.includes(v.vesselID)), [vessels, selectedVesselIdList]);
    const filters = useMemo(() => [{
        id: 'type', label: 'Vessel type', placeholder: 'All types', options: typeOptions,
        match: (v: Vessel, value: string) => (v.vslType || '').toUpperCase() === value.toUpperCase(),
    }], [typeOptions]);

    return (
        <RightsPicker<Vessel>
            title="Vessels" icon="pi pi-compass" noun="vessel"
            rows={vessels} dataKey="vesselID" rowKey={keyOf} searchText={textOf}
            columns={[{ field: 'vslName', header: 'Name' }, { field: 'vslType', header: 'Type', className: 'rp-col-narrow' }]}
            filters={filters} selected={selected} onChange={onSelectionChange} isViewMode={isViewMode}
        />
    );
};

export default VesselList;
