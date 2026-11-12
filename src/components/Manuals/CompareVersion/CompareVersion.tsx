import React, { useState, useEffect } from 'react';
import { Dropdown } from 'primereact/dropdown';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './CompareVersion.scss';

type ManualFormProps = {
    onSubmit: (data: ManualFormData) => void;
    closeForm: () => void;
    selectedManualID: number;
};

export type ManualFormData = {
    DM_ManualVersionID_ToCompare: number;
    IsSingleVersion: boolean
};

const defaultData: ManualFormData = {
    DM_ManualVersionID_ToCompare: -1,
    IsSingleVersion: false
};

const CompareVersion: React.FC<ManualFormProps> = ({ onSubmit, closeForm, selectedManualID }) => {
   const [form, setForm] = useState<ManualFormData>(defaultData);
   const [manualName, setManualName] = useState<string>('');
   const [currentVersion, setCurrentVersion] = useState<string>('');
   const [versionOptions, setVersionOptions] = useState<{ label: string; value: string }[]>([]);
   const [error, setError] = useState<string>('');

    useEffect(() => {
        dmsLifecycleService.getApiCall<{ version: string; dM_ManualVersionID: string }[] | null>(`Manuals/GetManualVersionList?dm_ManualID=${selectedManualID}`)
            .then(data => {
                const options = (data || []).map((cat) => ({
                    label: cat.version,
                    value: cat.dM_ManualVersionID
                }));
                setVersionOptions(options);
            })
            .catch(() => setVersionOptions([]));

          dmsLifecycleService.getApiCall(`Manuals/GetManualSimpleDetails/${selectedManualID}`)
            .then(data => {
                setManualName(data.manualName);
                setCurrentVersion(data.version);
            })
            .catch(() => setVersionOptions([]));
    }, [selectedManualID]);

    const handleCompare = (isSingle: boolean) => {
        if (form.DM_ManualVersionID_ToCompare === -1) {
            setError('Please select a version to compare.');
            return;
        }
        setError('');
        onSubmit({ ...form, IsSingleVersion: isSingle });
    };

    return (
        <div className="compare-version-container">
            <form onSubmit={(e) => e.preventDefault()} className="compare-manual-form">
                <div className="form-header">
                    <h3>Compare Manual Versions</h3>
                </div>
                {error && <div className="error-message">{error}</div>}
                <div className="form-body">
                    <div className="info-section">
                        <div className="info-item">
                            <span className="info-label">Manual Name</span>
                            <span className="info-value">{manualName}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Current Version</span>
                            <span className="info-value">{currentVersion}</span>
                        </div>
                    </div>
                    <div className="compare-selection">
                        <label htmlFor="version-dropdown">Version to Compare</label>
                        <div className="selection-control">
                            <Dropdown
                                id="version-dropdown"
                                value={form.DM_ManualVersionID_ToCompare}
                                options={versionOptions}
                                onChange={e => setForm(prev => ({ ...prev, DM_ManualVersionID_ToCompare: e.value }))}
                                placeholder="Select a Version"
                                scrollHeight="400px"
                                className="version-dropdown"
                                panelClassName="version-dropdown-panel"
                            />
                        </div>
                    </div>
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn-primary" onClick={() => handleCompare(false)}>
                        <i className="pi pi-arrows-h" /> Compare Versions
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => handleCompare(true)}>
                        <i className="pi pi-file" /> View Version
                    </button>
                    <button type="button" className="btn btn-cancel" onClick={closeForm}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

export default CompareVersion;