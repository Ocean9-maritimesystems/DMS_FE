import React, { useEffect, useState } from 'react';
import VesselList from './VesselList';
import VesselRankList from './VesselRankList';
import HQUserList, { HQUser } from './HQUserList';
import dmsLifecycleService from '../../services/DMSLifecycleService';
import './VesselDetails.scss';

type VesselFormProps = {
    manualTitle: string;
    onSubmit: (data: VesselFormData) => void;
    closeForm: () => void;
    selectedAction: string;
    selectedManualID: number;
};

export type VesselFormData = {
    DM_ManualID: number;
    CalledMode: string;
    VesselIdList: number[];
    VesselRankList: string[];
    HQ_UsersIDList: number[];
};

const defaultData: VesselFormData = {
    DM_ManualID: -1,
    CalledMode: '',
    VesselIdList: [],
    VesselRankList: [],
    HQ_UsersIDList: []
};

export interface Vessel {
    vesselID: number;
    vslName: string;
    vslType: string;
}

export interface VesselRank {
    userRank: string;
    userDeptDisplay?: string;
    userDept?: string;
}

/** api/Manuals/GetManualRightsUsersAsync */
export interface ManualRightsUsers {
    vesselList?: Vessel[];
    vslRankList?: VesselRank[];
    hqUserList?: HQUser[];
}

/** api/Manuals/GetSelectedManualRightsList */
interface SelectedManualRights {
    dM_ManualID?: number;
    vesselIdList?: number[];
    vesselRankList?: string[];
    hQ_UsersIDList?: number[];
}

const VesselDetails: React.FC<VesselFormProps> = ({ manualTitle, onSubmit, closeForm, selectedAction, selectedManualID }) => {
    const [form, setForm] = useState<VesselFormData>(defaultData);
    const [vslRank, setVslRank] = useState<VesselRank[]>([]);
    const [vesselList, setVesselList] = useState<Vessel[]>([]);
    const [hqUser, setHqUser] = useState<HQUser[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await dmsLifecycleService.getApiCall<ManualRightsUsers | null>('Manuals/GetManualRightsUsersAsync');
                setVesselList(data?.vesselList ?? []);
                setVslRank(data?.vslRankList ?? []);
                setHqUser(data?.hqUserList ?? []);
            } catch {
                setVslRank([]);
                setVesselList([]);
                setHqUser([]);
            }
            
            if ((selectedAction === 'Edit' || selectedAction === 'View') && selectedManualID > 0) {
                try {
                    const data = await dmsLifecycleService.getApiCall<SelectedManualRights>(`Manuals/GetSelectedManualRightsList/${selectedManualID}`);
                 
                    setForm({
                        DM_ManualID: data.dM_ManualID ?? selectedManualID ?? -1,
                        CalledMode: selectedAction,
                        VesselIdList: data.vesselIdList ?? [],
                        VesselRankList: data.vesselRankList ?? [],
                        HQ_UsersIDList: data.hQ_UsersIDList ?? []
                    });
                } catch {
                    // Rights could not be loaded: the lists start empty and the user can pick again.
                }
            }
            else {
                setForm({
                    DM_ManualID: selectedManualID ?? -1,
                    CalledMode: selectedAction,
                    VesselIdList: [],
                    VesselRankList: [],
                    HQ_UsersIDList: []
                });
            }
        };
        fetchData();
    }, [selectedAction, selectedManualID]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(form);
    };

    const handleVesselSelectionChange = (selected: Vessel[]) => {
        const vesselIDs = selected.map(v => v.vesselID);
        setForm(prev => ({ ...prev, VesselIdList: vesselIDs }));
    };

    const handleVesselRankSelectionChange = (selected: VesselRank[]) => {
        const vslRank = selected.map(v => v.userRank);
        setForm(prev => ({ ...prev, VesselRankList: vslRank }));
    };

    const handleHQUserSelectionChange = (selected: HQUser[]) => {
        const hqUser = selected.map(v => v.hQ_UsersID);
        setForm(prev => ({ ...prev, HQ_UsersIDList: hqUser }));
    };
    
    const formatManualTitle = (title: string): string => {
        return title?.replace(/_/g, ' ') || title || '';
    };

    return (
        <form onSubmit={handleSubmit} className="vessel-details-form">
            <div className="vessel-rights-toolbar" style={{ marginBottom: '1px', width: '100%', flexDirection: 'row', display: 'flex', justifyContent: 'space-between' }}>
                <div className="manual-details-header">
                    <h3 
                     data-title={manualTitle?.replace(/_/g, ' ')}
                     style={{ 
                         textDecoration: 'none',
                         color: 'var(--text-primary)',
                         fontWeight: '600',
                         margin: '0',
                         fontSize: '1.25rem'
                     }}>
                        {formatManualTitle(manualTitle)}
                     </h3>
                </div>
                <div className="d-flex justify-content-end" style={{ textAlign: 'right', width: '200px', gap: '10px' }}>
                  {selectedAction !== 'View' && (
                        <button type="submit" className="button" style={{width: '100px'}}>
                            Save
                        </button>
                    )} 
                 <button type="button" className="button" onClick={closeForm}>
                        Cancel
                    </button>
                </div>
            </div>
            <div className="vessel-rights-grid" style={{ display: 'flex', gap: '25px', marginTop: '10px' }}>
                <div className="vessel-rights-panel vessel-panel" style={{ width: '500px' }}>
                    <VesselList
                        vessels={vesselList}
                        selectedVesselIdList={form.VesselIdList}
                        onSelectionChange={handleVesselSelectionChange}
                        isViewMode={selectedAction === 'View'}
                    />
                </div>
                <div className="vessel-rights-panel rank-panel" style={{ width: '300px'}}>
                    <VesselRankList
                        vslRank={vslRank}
                        selectedVesselRankList={form.VesselRankList}
                        onSelectionChange={handleVesselRankSelectionChange}
                        isViewMode={selectedAction === 'View'}
                    />
                </div>
                <div className="vessel-rights-panel hq-panel" style={{ width: '650px'}}>
                    <HQUserList
                        hqUser={hqUser}
                        selectedHQUserList={form.HQ_UsersIDList}
                        onSelectionChange={handleHQUserSelectionChange}
                        isViewMode={selectedAction === 'View'}
                    />
                </div>
            </div>
        </form>
    );
};

export default VesselDetails;