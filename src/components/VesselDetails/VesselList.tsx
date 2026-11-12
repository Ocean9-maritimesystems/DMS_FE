import React, { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Vessel } from './VesselDetails';
import dmsLifecycleService from '../../services/DMSLifecycleService';

interface VesselListProps {
    vessels: Vessel[];
    selectedVesselIdList?: number[];
    /** The selected vessels (rows, not IDs). */
    onSelectionChange?: (selected: Vessel[]) => void;
    isViewMode?: boolean;
    }

const VesselList: React.FC<VesselListProps> = ({ vessels, selectedVesselIdList, onSelectionChange, isViewMode }) => {
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectedVessels, setSelectedVessels] = useState<Vessel[]>([]);
    const [selectedVesselType, setSelectedVesselType] = useState<string | null>(null);
    const [vesselTypeOptions, setVesselTypeOptions] = useState<{ label: string; value: string }[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const [allData, setAllData] = useState<Vessel[]>([]);

    useEffect(() => {
        dmsLifecycleService.getApiCall<string[] | null>('Vessel/GetVslType')
            .then(data => {
                const options = (data || []).map((cat) => ({
                    label: cat,
                    value: cat
                }));
                setVesselTypeOptions(options);
            })
            .catch(() => setVesselTypeOptions([]));

    }, []);
    
    useEffect(() => {
        setAllData(vessels);
        const selectedVesselsFromIds = vessels.filter(vessel =>
            selectedVesselIdList?.includes(vessel.vesselID)
        );

        setSelectedVessels(selectedVesselsFromIds);
	    setIsLoading(false);
    }, [vessels, selectedVesselIdList]);

    const filteredVessels = allData.filter(vessel => {
        const vslType = vessel.vslType || '';
        
        const vslTypeMatch = selectedVesselType
            ? (vslType && vslType.toUpperCase() === selectedVesselType.toUpperCase())
            : true;
        
        return vslTypeMatch;
   });

    const handleSelectionChange = (e: { value: Vessel[] }) => {
        if (isViewMode) return;
        setSelectedVessels(e.value);
        onSelectionChange?.(e.value);
    };
    
    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchValue(value);

        if (value.trim() === '') {
            setAllData(vessels);
        } else {
            const filtered = vessels.filter(vsl => 
                vsl.vslName.toLowerCase().includes(value.toLowerCase()) ||
                vsl.vslType.toLowerCase().includes(value.toLowerCase())
            );
            setAllData(filtered);
        }
    };

    return (
        <div className='vessel-details-container'>
            <div>
                <label className="headerLabel">Vessel List</label>
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
                <label style={{ fontWeight: 'bold', width: '50px' }}>Type: </label>
                <Dropdown
                    value={selectedVesselType}
                    options={vesselTypeOptions}
                    onChange={e => setSelectedVesselType(e.value)}
                    placeholder="Select Vessel Type"
                    style={{ width: '10px', height: '40px', verticalAlign: 'middle' }}
                    showClear
                />
            </div>
            <div>
                <DataTable
                    value={filteredVessels}
                    loading={isLoading}
                    selection={selectedVessels}
                    onSelectionChange={isViewMode ? undefined : handleSelectionChange}
                    selectionMode="checkbox"
                    dataKey="vesselID"
                    scrollable scrollHeight="470px"
                    emptyMessage={isLoading ? 'Loading...' : 'No vessel found.'}
                    className="vessel-rank-list p-datatable-gridlines"
                    style={{ width: '100%' }}
                >
                    <Column
                        selectionMode="multiple"
                        bodyStyle={{ width: '50px', verticalAlign: 'center', textAlign: 'center' }}
                        body={isViewMode ? (rowData => <input type="checkbox" checked={selectedVessels.some(v => v.vesselID === rowData.vesselID)} disabled />) : undefined}
                    />
                    <Column field="vslName" header="Name" sortable bodyStyle={{ width: '400px' }} />
                    <Column field="vslType" header="Type" sortable bodyStyle={{ width: '100px' }} />
                    <Column field="vesselID" header="ID" sortable hidden={true} />
                </DataTable>
            </div>
        </div>
    );
};

export default VesselList;