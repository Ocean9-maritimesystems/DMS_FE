import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ManualsTreeView, { type ManualsTreeViewHandle } from './ManualsTreeView';
import ManualsContent from './ManualsContent';
import PageHeader from '../../PageHeader';
import ManualLinkList from './ManualLinkList';
import { useManualLinkView } from '../../../config/manualLinkView';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './ManualMainPage.scss';

/** Manual links. Keys are the ?mode= values (dashboard links use the same ones). */
export const MANUAL_FILTERS: Record<string, { label: string }> = {
    new: { label: 'New documents' },
    userfavorites: { label: 'My favourites' },
    vsltoack: { label: 'Vessel acknowledgement required' },
    usertoack: { label: 'Pending my acknowledgement' },
    pendingapproval: { label: 'Pending my approval' },
    underreview: { label: 'Pending my review' },
};

export interface ManualDetailsProps {
    userId: string;
}

/** api/Manuals/GetUserManualCounts */
interface UserManualCounts {
    approvalCnt?: number;
    reviewCnt?: number;
    ackCnt?: number;
    newCnt?: number;
    favouriteCnt?: number;
}

const ManualMainPage: React.FC<ManualDetailsProps> = ({ userId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    // Tree filter from a dashboard link (/manuals?mode=new) or a menu link below the tree.
    const [searchParams, setSearchParams] = useSearchParams();
    const filterMode = (searchParams.get('mode') || '').toLowerCase();
    // A manual to open (?id=, or ?manual= in older links), from the inbox, search, pending lists or a circular's links.
    const focusManualId = searchParams.get('id') || searchParams.get('manual') || undefined;
    const filter = MANUAL_FILTERS[filterMode];
    const filterLabel = filter?.label;
    // Settings (gear icon in the header): filter the tree, or show the matching manuals as a list in place of the tree.
    const [linkView] = useManualLinkView();
    const treeFilterMode = filter && linkView === 'tree' ? filterMode : undefined;
    const showList = !!filter && linkView === 'grid';
    const [listRefreshKey, setListRefreshKey] = useState(0);
    const [approvalCnt, setApprovalCnt] = useState(0); 
    const [reviewCnt, setReviewCnt] = useState(0);
    const [ackCnt, setAckCnt] = useState(0);
    const [newCnt, setNewCnt] = useState(0);
    const [favouriteCnt, setFavouriteCnt] = useState(0);
    const treeViewRef = useRef<ManualsTreeViewHandle>(null);

    const setUserActionCounts = useCallback(() => {
        dmsLifecycleService.getApiCall<UserManualCounts | null>(`Manuals/GetUserManualCounts?userId=${encodeURIComponent(userId)}`)
            .then((data) => {
                if (data) {
                    setApprovalCnt(data.approvalCnt || 0);
                    setReviewCnt(data.reviewCnt || 0);
                    setAckCnt(data.ackCnt || 0);
                    setNewCnt(data.newCnt || 0);
                    setFavouriteCnt(data.favouriteCnt || 0);
                }
            })
            .catch(() => {
                setApprovalCnt(0);
                setReviewCnt(0);
                setAckCnt(0);
                setNewCnt(0);
                setFavouriteCnt(0);
            });
    }, [userId]);

    useEffect(() => {
        setUserActionCounts();
    }, [setUserActionCounts]);

    /** Quick filters above the tree (the same ?mode= values as the dashboard links). Tree setting: only the matching
     *  manuals (parents visible but disabled); list setting: the matching manuals as a list instead of the tree. */
    const filterChips = [
        { mode: 'pendingapproval', label: 'To approve', icon: 'pi pi-check-circle', count: approvalCnt },
        { mode: 'underreview', label: 'To review', icon: 'pi pi-eye', count: reviewCnt },
        { mode: 'usertoack', label: 'To acknowledge', icon: 'pi pi-verified', count: ackCnt },
        { mode: 'new', label: 'New', icon: 'pi pi-plus-circle', count: newCnt },
        { mode: 'userfavorites', label: 'Favourites', icon: 'pi pi-star', count: favouriteCnt },
    ];

    const clearFilter = () => setSearchParams({});

    const LoadTreeNodeData = () => {
        setUserActionCounts();
        setListRefreshKey((k) => k + 1); // reload the list after an edit (list setting)

        if (treeViewRef.current && typeof treeViewRef.current.refreshTree === 'function') {
            treeViewRef.current.refreshTree();
        }
    };

    return (
        <div className='main-page-wrapper'>
            <PageHeader title="Manuals" />
            <div className="main-page-content">
                <div className="tree-section">
                    <div className="manual-filters" role="group" aria-label="Show only">
                        {filterChips.map((c) => {
                            const on = filterMode === c.mode;
                            return (
                                <button key={c.mode} type="button" className={`manual-filter${on ? ' is-on' : ''}${c.count === 0 ? ' is-empty' : ''}`}
                                    aria-pressed={on} title={on ? 'Show all manuals again' : `Show only: ${MANUAL_FILTERS[c.mode].label}`}
                                    onClick={() => setSearchParams(on ? {} : { mode: c.mode })}>
                                    <i className={c.icon} aria-hidden="true" />
                                    <span>{c.label}</span>
                                    <span className="manual-filter__count">{c.count}</span>
                                    {on && <i className="pi pi-times manual-filter__clear" aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </div>
                    {filter && (
                        <div className="tree-filter-bar" role="status">
                            <span><i className="pi pi-filter" /> Showing: <strong>{filterLabel}</strong></span>
                            <button type="button" onClick={clearFilter}>Show all manuals</button>
                        </div>
                    )}
                    <div className="tree-container">
                        {showList ? (
                            <ManualLinkList
                                key={`${filterMode}-${listRefreshKey}`}
                                userId={userId}
                                calledMode={filterMode}
                                onFavoritesChanged={LoadTreeNodeData}
                            />
                        ) : (
                            <ManualsTreeView ref={treeViewRef} userId={userId} calledMode={treeFilterMode} focusManualId={focusManualId} />
                        )}
                    </div>
                </div>
                <div className={`content-section with-tree`}>
                    <div ref={scrollRef} />
                    <ManualsContent userId={userId} onRefreshTree={LoadTreeNodeData} />
                </div>
            </div>
        </div>
    );
};

export default ManualMainPage;