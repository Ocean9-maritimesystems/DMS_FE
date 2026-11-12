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

    /** Tree setting: show only the manuals behind the link (parents visible but disabled).
     *  List setting: show the manuals behind the link as a list instead of the tree. */
    const usersManualAction = (e: React.MouseEvent<HTMLAnchorElement>, mode: string) => {
        e.preventDefault();
        setSearchParams(mode === filterMode ? {} : { mode });
    };

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
                    <div className="menu-section">
                        <a href="#" className={`menu-link${filterMode === 'pendingapproval' ? ' active' : ''}`} onClick={(e) => usersManualAction(e, "pendingapproval")}>
                            <i className="pi pi-clock"></i>
                            <span>Pending My Approval ({approvalCnt})</span>
                        </a>
                        <a href="#" className={`menu-link${filterMode === 'underreview' ? ' active' : ''}`} onClick={(e) => usersManualAction(e, "underreview")}>
                            <i className="pi pi-eye"></i>
                            <span>Pending My Review ({reviewCnt})</span>
                        </a>
                        <a href="#" className={`menu-link${filterMode === 'usertoack' ? ' active' : ''}`} onClick={(e) => usersManualAction(e, "usertoack")}>
                            <i className="pi pi-thumbs-up"></i>
                            <span>Pending My Acknowledgement ({ackCnt})</span>
                        </a>
                        <a href="#" className={`menu-link${filterMode === 'new' ? ' active' : ''}`} onClick={(e) => usersManualAction(e, "new")}>
                            <i className="pi pi-plus-circle"></i>
                            <span>New Documents ({newCnt})</span>
                        </a>
                        <a href="#" className={`menu-link${filterMode === 'userfavorites' ? ' active' : ''}`} onClick={(e) => usersManualAction(e, "userfavorites")}>
                            <i className="pi pi-star-fill"></i>
                            <span>My Favourites ({favouriteCnt})</span>
                        </a>
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