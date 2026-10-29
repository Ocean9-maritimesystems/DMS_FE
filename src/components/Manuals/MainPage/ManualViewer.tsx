import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ListBox, type ListBoxChangeEvent } from 'primereact/listbox';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';
import { TreeNode } from 'primereact/treenode';
import PageHeader from '../../PageHeader';
import ManualsContent from './ManualsContent';
import { useDispatch } from 'react-redux';
import { setError, setSelectedManualNodeObj } from '../../../store/slices/appSlice';
import './ManualViewer.scss';
import dmsLifecycleService from '../../../services/DMSLifecycleService';


interface TreeNodeData extends TreeNode  {
    data: {
        dM_ManualID: number;
        dM_ManualVersionID: number;
        category: string;
        manualVersion: string;
    };
}

interface ManualViewerProps {
    calledMode: string;
    userId: string;
}

const ManualViewer: React.FC<ManualViewerProps> = ({ calledMode, userId }) => {
    const dispatch = useDispatch();
    const [manuals, setManuals] = useState<TreeNodeData[]>([]);
    const [selectedManual, setSelectedManual] = useState<TreeNodeData | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchManuals = useCallback(async () => {
        setLoading(true);
        try {
            const data = (await dmsLifecycleService.getApiCall<TreeNodeData[] | null>(
                `Manuals/GetManualListBasedOnCalledMode?calledMode=${encodeURIComponent(calledMode)}&userId=${encodeURIComponent(userId)}`)) || [];
            setManuals(data);
            setSelectedManual(data[0] ?? null);
            dispatch(setSelectedManualNodeObj(data[0] ?? null));
        } catch {
            dispatch(setError('Failed to fetch manuals'));
        } finally {
            setLoading(false);
        }
    }, [calledMode, userId, dispatch]);

    useEffect(() => {
        fetchManuals();
    }, [fetchManuals]);

    const filteredManuals = manuals.filter(manual =>
        manual.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        manual.data.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const onSelectionChange = (e: ListBoxChangeEvent) => {
       const manual = (e.value as TreeNodeData | null) ?? null;
       setSelectedManual(manual);
       dispatch(setSelectedManualNodeObj(manual));
    };

    const manualTemplate = (manual: TreeNodeData) => {
        return (
            <div className="manual-item">
                <div className="manual-info">
                    <div className="manual-title">{manual.label}</div>
                    <div className="manual-category">{manual.data.category}</div>
                </div>
                <div className="manual-version-badge">v{manual.data.manualVersion}</div>
            </div>
        );
    };

    return (
        <div className='main-page-wrapper'>
          <PageHeader title="Manuals" />
            <div className="manual-viewer-container">
                {/* Left Sidebar - Manual List */}
                <div className="manual-sidebar">
                    <div className="sidebar-header">
                        <h2><i className="pi pi-book"></i> Manual List</h2>
                        <Button 
                            icon="pi pi-refresh" 
                            rounded 
                            onClick={() => fetchManuals()}
                            tooltip="Refresh"
                        />
                    </div>

                    <div className="search-box">
                        <span className="p-input-icon-left">
                            <i className="pi pi-search" />
                            <InputText
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search manuals..."
                                className="search-input"
                            />
                        </span>
                    </div>

                    <div className="manual-list-container">
                        {loading ? (
                            <div className="skeleton-list">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="skeleton-item">
                                        <Skeleton width="100%" height="60px" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <ListBox
                                value={selectedManual}
                                onChange={(e) => onSelectionChange(e)}
                                options={filteredManuals}
                                optionLabel="title"
                                itemTemplate={manualTemplate}
                                className="manual-listbox"
                                listStyle={{ maxHeight: 'calc(100vh - 250px)' }}
                            />
                        )}
                    </div>
                </div>

                {/* Right Content - Manual Details */}
                <div className="manual-content">
                    {selectedManual ? (
                        <>
                           <div className={`content-section full-width`}>
                                <div ref={scrollRef} />
                                <ManualsContent userId={userId} />
                            </div>
                        </>
                    ) : (
                        <div className="no-selection">
                            <i className="pi pi-book" style={{ fontSize: '4rem', color: 'var(--text-secondary)' }}></i>
                            <h2>No Manual Selected</h2>
                            <p>Select a manual from the list to view its content</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManualViewer;