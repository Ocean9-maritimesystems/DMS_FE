import React, { useMemo } from 'react';
import { VesselRank } from './VesselDetails';
import RightsPicker from './RightsPicker';

interface VesselRankListProps {
    vslRank: VesselRank[];
    selectedVesselRankList?: string[];
    /** The selected ranks (rows, not names). */
    onSelectionChange?: (selected: VesselRank[]) => void;
    isViewMode?: boolean;
}

const DEPT_OPTIONS = [
    { label: 'Deck', value: 'd' },
    { label: 'Engine', value: 'e' },
    { label: 'Electrical', value: 'l' },
];

const keyOf = (r: VesselRank) => r.userRank;
const textOf = (r: VesselRank) => `${r.userRank ?? ''} ${r.userDeptDisplay ?? ''}`;
const FILTERS = [{
    id: 'dept', label: 'Department', placeholder: 'All departments', options: DEPT_OPTIONS,
    match: (r: VesselRank, value: string) => (r.userDept || '').toUpperCase() === value.toUpperCase(),
}];

const VesselRankList: React.FC<VesselRankListProps> = ({ vslRank, selectedVesselRankList, onSelectionChange, isViewMode }) => {
    const selected = useMemo(() => vslRank.filter((r) => selectedVesselRankList?.includes(r.userRank)), [vslRank, selectedVesselRankList]);

    return (
        <RightsPicker<VesselRank>
            title="Ranks on board" icon="pi pi-users" noun="rank"
            rows={vslRank} dataKey="userRank" rowKey={keyOf} searchText={textOf}
            columns={[{ field: 'userRank', header: 'Rank' }, { field: 'userDeptDisplay', header: 'Dept' }]}
            filters={FILTERS} selected={selected} onChange={onSelectionChange} isViewMode={isViewMode}
        />
    );
};

export default VesselRankList;
