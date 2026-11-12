import React, { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { VesselRank } from './VesselDetails';

interface VesselRankListProps {
    vslRank: VesselRank[];
    selectedVesselRankList?: string[];
    /** The selected ranks (rows, not names). */
    onSelectionChange?: (selected: VesselRank[]) => void;
    isViewMode?: boolean;
}

const VesselRankList: React.FC<VesselRankListProps> = ({ vslRank, selectedVesselRankList, onSelectionChange, isViewMode }) => {
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectedVslRank, setSelectedVslRank] = useState<VesselRank[]>([]);
    const [selectedVslDept, setSelectedVslDept] = useState<string | null>(null);
    const [vesselDeptOptions, setVesselDeptOptions] = useState<{ label: string; value: string }[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const [allData, setAllData] = useState<VesselRank[]>([]);

    useEffect(() => {
        setVesselDeptOptions([
            { label: 'Deck', value: 'd' },
            { label: 'Engine', value: 'e' },
            { label: 'Electrical', value: 'l' }
        ]);

    }, []);


    useEffect(() => {
        setAllData(vslRank);
        const selectedVslRanks = vslRank.filter(vessel =>
            selectedVesselRankList?.includes(vessel.userRank)
        );
        setSelectedVslRank(selectedVslRanks)
	    setIsLoading(false);
    }, [vslRank, selectedVesselRankList]);


    const filteredVessels = allData.filter(vsl => {
        const dept = vsl.userDept || '';
        const deptMatch = selectedVslDept
            ? (dept && dept.toUpperCase() === selectedVslDept.toUpperCase())
            : true;
        
        return deptMatch;
   });

    const handleSelectionChange = (e: { value: VesselRank[] }) => {
        if (isViewMode) return;
        setSelectedVslRank(e.value);
        onSelectionChange?.(e.value);
    };

    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchValue(value);

        if (value.trim() === '') {
            setAllData(vslRank);
        } else {
            const filtered = vslRank.filter(rank => 
                rank.userRank.toLowerCase().includes(value.toLowerCase()) ||
                rank.userDeptDisplay?.toLowerCase().includes(value.toLowerCase())
            );
            setAllData(filtered);
        }
    };

    return (
        <div className='vessel-details-container'>
            <div>
                 <label className="headerLabel">Vessel Staff List</label>
            </div>
            <div className="p-inputgroup">
                <InputText
                    placeholder="Search..."
                    value={searchValue}
                    onChange={onSearchChange}
                    style={{ 
                        height: '38px', 
                        paddingLeft: '10px' 
                    }}
                />
            </div>
             <div className="p-inputgroup" style={{ alignItems: 'center' }}>
                <label style={{ fontWeight: 'bold', width: '50px' }}>Dept: </label>
                <Dropdown
                    value={selectedVslDept}
                    options={vesselDeptOptions}
                    onChange={e => setSelectedVslDept(e.value)}
                    placeholder="Select Dept"
                    style={{ width: '10px', height: '40px', verticalAlign: 'middle' }}
                    showClear
                />
            </div>
            <div>
                <DataTable
                    value={filteredVessels}
                    loading={isLoading}
                    selection={selectedVslRank}
                    onSelectionChange={isViewMode ? undefined : handleSelectionChange}
                    selectionMode="checkbox"
                    dataKey="userRank"
                    scrollable 
                    emptyMessage={isLoading ? 'Loading...' : 'No user found.'}
                    className="vessel-rank-list p-datatable-gridlines"
                >
                    <Column
                        selectionMode="multiple"
                        bodyStyle={{ width: '50px', verticalAlign: 'center', textAlign: 'center' }}
                        body={isViewMode ? (rowData => <input type="checkbox" checked={selectedVslRank.some(v => v.userRank === rowData.userRank)} disabled />) : undefined}
                    />
                    <Column field="userRank" header="Rank" sortable bodyStyle={{ width: '120px' }}  />
                    <Column field="userDeptDisplay" header="Dept" sortable bodyStyle={{ width: '120px' }}  />
                    <Column field="userDept" header="Dept" sortable hidden={true} />
                </DataTable>
            </div>
        </div>
    );
};

export default VesselRankList;