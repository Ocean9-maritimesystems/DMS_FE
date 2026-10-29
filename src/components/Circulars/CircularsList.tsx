import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DataView } from 'primereact/dataview';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Tree, type TreeProps, type TreeEventNodeEvent } from 'primereact/tree';
import { SelectButton } from 'primereact/selectbutton';
import { TreeNode } from 'primereact/treenode';
import { ContextMenu } from 'primereact/contextmenu';
import { MenuItem } from 'primereact/menuitem';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { useDispatch } from 'react-redux';
import dmsLifecycleService from '../../services/DMSLifecycleService';
import PageHeader from '../PageHeader';
import './CircularsList.scss';
import { setError } from '../../store/slices/appSlice';
import AddEditCircular, { type CircularFormData } from './AddEditCircular/AddEditCircular';
import { Dialog } from 'primereact/dialog';
import CircularsLogDetails from './CircularsLogDetails';
import { formatDate } from '../utils/formatDate';
import notify from '../../services/notify';
import { errorMessage } from '../../services/DMSLifecycleService';
import CircularExtrasPanel from './CircularExtrasPanel';
import featureApi from '../../services/featureApi';

/* ---------- Downloading a circular's attachment ---------- */

const ATTACHMENT_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** The file bytes from GetCIRDetails (base64 text, possibly a data: URL). */
const attachmentBytes = (contents: unknown): Uint8Array | null => {
    if (contents instanceof Uint8Array) return contents;
    if (Array.isArray(contents)) return new Uint8Array(contents as number[]);
    if (typeof contents !== 'string' || !contents.trim()) return null;
    try {
        const base64 = contents.includes(',') ? contents.slice(contents.indexOf(',') + 1) : contents;
        const text = window.atob(base64);
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
};

/** Saves the bytes as a file in the browser's downloads. */
const saveFile = (bytes: Uint8Array, fileName: string, mimeType?: string) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType || 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};

interface Circular {
    ciR_CategoryID: number;
    ciR_MasterID: number;
    circularType: string;
    category: string;
    ciR_Number: string;
    reference: string,
    title: string;
    statusString: 'Active' | 'Archived' | 'Draft';
    priority: 'High' | 'Medium' | 'Low';
    dateIssued: string;
    cIRLevel: number;
    releasedDate: string;
    attachmentCount: number;
    isActive?: boolean;
    isFavourite? : boolean;
    isCategory?: boolean;
    remarks?: string;
}

interface AckList {
    cIR_UserAckID: string;
    vsselID: string;
    vslName: string;
    acknowledgedBy: string;
    dateRead: string;
    status: 'Acknowledged' | 'Pending' | 'Overdue';
    comments?: string;
}

interface CircularsListProps {
    userId: string;
    calledMode?: string;
    /** Circular to select when the list has loaded (?id= in the address). */
    focusId?: string | null;
}

type TreeSelectionEvent = Parameters<NonNullable<TreeProps['onSelectionChange']>>[0];

/** api/circular/GetCIRDetails: what a download needs. */
interface CircularFileDto {
    blobContents?: unknown;
    ciR_Number?: string;
    fileName?: string;
    description?: string;
    fileType?: string;
    originalFileType?: string;
}

interface TreeNodeData extends TreeNode {
    data: Circular;
}

const formatDisplayDate = (value: string | Date | null | undefined): string => {
    if (!value) return '-';

    return formatDate(value);
};

const CircularsList: React.FC<CircularsListProps> = ({ userId, calledMode, focusId }) => {
    const dispatch = useDispatch();
    const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: number }[]>([]); // value: ciR_CategoryID
    const [mode, setMode] = useState<string>('');
    const [headerTitle, setHeaderTitle] = useState('');
    const [circulars, setCirculars] = useState<Circular[]>([]);
    const [selectedCircular, setSelectedCircular] = useState<Circular | null>(null);
    const [ackList, setAckList] = useState<AckList[]>([]);
    const [filteredAckList, setFilteredAckList] = useState<AckList[]>([]);
    const [vesselFilter, setVesselFilter] = useState<string>('all');
    const [vesselOptions, setVesselOptions] = useState<{ label: string; value: string }[]>([{ label: 'All Vessels', value: 'all' }]);
    const [loading, setLoading] = useState(true);
    const [ackLoading, setAckLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState('newest');
    const [filterCategory, setFilterCategory] = useState(-1);
    const [nodes, setNodes] = useState<TreeNodeData[]>([]);
    const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
    const [selectedAction, setSelectedAction] = useState<string>('Add');
    const [expandedKeys, setExpandedKeys] = useState<{ [key: string]: boolean }>({});
    const [viewMode, setViewMode] = useState('list');
    const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
    const [showCircularsLogDialog, setShowCircularsLogDialog] = useState<boolean>(false);
    const cm = React.useRef<ContextMenu>(null);
    const hasAttachment = (circular: Circular | null | undefined) => Number(circular?.attachmentCount ?? 0) > 0;
    /** Only a draft can be edited: a released (Active / Archived) or cancelled circular is fixed. */
    const canEditCircular = (circular: Circular | null | undefined) => String(circular?.statusString ?? '').toLowerCase() === 'draft';

    const menuItems: MenuItem[] = [
        { label: 'Edit', icon: 'pi pi-fw pi-pencil', disabled: !canEditCircular(selectedCircular), command: () => handleEdit(selectedCircular?.ciR_MasterID || 0) },
        { label: 'Download attachment', icon: 'pi pi-fw pi-download', disabled: !hasAttachment(selectedCircular), command: () => handleDownload(selectedCircular?.ciR_MasterID || 0) },
        { label: 'Log', icon: 'pi pi-fw pi-history', command: () => handleLog(selectedCircular?.ciR_MasterID || 0) },
        {
            label: selectedCircular?.isFavourite ? 'Remove from Favorites' : 'Add to Favorites',
            icon: selectedCircular?.isFavourite ? 'pi pi-fw pi-star-fill' : 'pi pi-fw pi-star',
            command: () => handleFavourite(selectedCircular?.ciR_MasterID || 0)
        }
    ];

    const sortOptions = [
        { label: 'Newest First', value: 'newest' },
        { label: 'Oldest First', value: 'oldest' },
        { label: 'Priority', value: 'priority' }
    ];

    const viewOptions = [
        { icon: 'pi pi-align-justify', value: 'list', label: 'List view' },
        { icon: 'pi pi-th-large', value: 'grid', label: 'Card view' },
        { icon: 'pi pi-sitemap', value: 'tree', label: 'Tree by category' }
    ];

    /** "Circular" / "Alert" for buttons and messages (mode is plural). */
    const itemLabel = mode === 'Circulars' ? 'Circular' : mode === 'Alerts' ? 'Alert' : 'Item';
    const isFavoritesMode = (calledMode ?? '').toLowerCase().includes('favorite');
    
    useEffect(() => {
        localStorage.setItem('lastDashboardTab', 'circulars');

        dmsLifecycleService.getApiCall<{ category: string; ciR_CategoryID: number }[] | null>(`circular/GetCategories?isToIncludeAll=true&circularType=${calledMode}`)
            .then(data => {
                const options = (data || []).map((item) => ({
                    label: item.category ,
                    value: item.ciR_CategoryID ,
                }));
                setCategoryOptions(options);
            })
            .catch(() => setCategoryOptions([]));
    }, [calledMode]);
    
    useEffect(() => {
        const getHeaderTitle = () => {
            if (!calledMode) {
                return 'Circulars & Alerts Dashboard';
            }
 
            const titleMap: { [key: string]: string } = {
                'all': 'Dashboard',
                'new': 'New',
                'favorites': 'My Favorites',
                'toack': 'Acknowledgment Required',
                'pending': 'Pending',
                'acknowledged': 'Acknowledged',
                'archived': 'Archived'
            };
    
            // Case-insensitive: links use both "circulars" and "Circulars".
            const lower = calledMode.toLowerCase();
            let modeValue = lower;
            let type = 'Circulars & Alerts';

            if (lower.endsWith('circulars')) {
                modeValue = lower.slice(0, -'circulars'.length);
                type = 'Circulars';
            } else if (lower.endsWith('alerts')) {
                modeValue = lower.slice(0, -'alerts'.length);
                type = 'Alerts';
            }

            const baseTitle = titleMap[modeValue] || '';
            setMode(type);
            return `${baseTitle} ${type}`;
        };

        setHeaderTitle(getHeaderTitle());
    }, [calledMode]);
    
    // Reload when the user or the mode in the address changes (circulars <-> alerts reuse this page).
    useEffect(() => {
        setSelectedCircular(null);
        setSearchTerm('');
        setFilterCategory(-1);
        fetchCirculars();
        LoadTreeNodeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, calledMode, focusId]);

    const fetchCirculars = async (): Promise<Circular[]> => {
        let loaded: Circular[] = [];
        setLoading(true);
        try {
            // All categories are loaded once; the category dropdown filters in the browser.
            const data: Circular[] = await dmsLifecycleService.getApiCall(`Circular/GetCIRMasterList?userId=${userId}&categoryId=-1&circularType=${calledMode}`);
            setCirculars(data || []);
            loaded = data || [];
            // Opened from the inbox, a search or a manual (?id=): select that circular.
            const focused = focusId ? (data || []).find((c) => String(c.ciR_MasterID) === String(focusId)) : undefined;
            if (focused) setSelectedCircular(focused);
            // Keep the open circular in step with the list (e.g. Draft -> Active after Release).
            else setSelectedCircular((current) => (current
                ? (data || []).find((c) => c.ciR_MasterID === current.ciR_MasterID) ?? current
                : current));
        } catch (err) {
            setCirculars([]);
            notify.error(errorMessage(err), `Could not load ${mode ? mode.toLowerCase() : 'circulars'}`);
        } finally {
            setLoading(false);
        }
        return loaded;
    };
    
    const LoadTreeNodeData = async () => {
        try {
            const data: TreeNodeData[] = await dmsLifecycleService.getApiCall(`Circular/GetTreeViewCircularList?userId=${userId}&circularType=${calledMode}`);
            setNodes(data);
            
            if (selectedAction === 'Add' || selectedAction === 'Edit' || selectedAction === 'Refresh') {
                return;
            }
            else {
                const firstNode = getFirstNodeKey(data);
                if (firstNode && firstNode.key) {
                    const firstKey = String(firstNode.key);
                    setExpandedKeys({ [firstKey]: true });
                    setSelectedNodeKey(String(data[0].key));
                }
            }
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The circulars could not be loaded.')));
        } finally {
            setLoading(false);
        }
    }

    function getFirstNodeKey(list: TreeNodeData[]): TreeNodeData | null {
        return list && list.length > 0 ? list[0] : null;
    }
    
    const onSelectionChange = (e: TreeSelectionEvent) => {
        const key = typeof e.value === 'string' ? e.value : null; // single selection: the key itself
        setSelectedNodeKey(key);
        const node = key == null ? null : findNodeByKey(nodes, key);
        if (node) {
            if (node.data.isCategory) {
                setSelectedCircular(null);
            } else {
                setSelectedCircular(node.data as Circular);
            }
        }
    }

    const onTreeContextMenu = (event: TreeEventNodeEvent) => {
        event.originalEvent.preventDefault();
        const node = event.node as TreeNodeData;
        setSelectedNodeKey(node.key == null ? null : String(node.key));
        if (node && !node.data.isCategory) {
            setSelectedCircular(node.data as Circular);
            cm.current?.show(event.originalEvent);
        }
        else {
            cm.current?.hide(event.originalEvent);
            setSelectedCircular(null);
        }
    };

    const onListContextMenu = (event: React.MouseEvent, circular: Circular) => {
        event.preventDefault();
        setSelectedCircular(circular);
        cm.current?.show(event);
    };

    const treeNodeTemplate = (node: TreeNode) => {
        const circular = (node as TreeNodeData).data;

        if (circular?.isCategory) {
            return (
                <span className="tree-category-label">
                    <i className="pi pi-folder" aria-hidden="true" />
                    <span>{node.label}</span>
                    {!!node.children?.length && <span className="tree-category-count">{node.children.length}</span>}
                </span>
            );
        }

        if (circular) {
            return (
                <span className="tree-circular-label" title={`${circular.ciR_Number} - ${circular.title}`}>
                    <span className="tree-circular-number">{circular.ciR_Number}</span>
                    <span className="tree-circular-title">{circular.title}</span>
                </span>
            );
        }

        return <span>{node.label}</span>;
    };
    
    useEffect(() => {
        if (selectedCircular) {
            fetchAckList(selectedCircular.ciR_MasterID);
        }
    }, [selectedCircular]);

    useEffect(() => {
        if (vesselFilter === 'all') {
            setFilteredAckList(ackList);
        } else {
            setFilteredAckList(ackList.filter(item => item.vslName === vesselFilter));
        }
    }, [vesselFilter, ackList]);

    const fetchAckList = async (circularId: number) => {
        setAckLoading(true);
        
        try {
            const ackList: AckList[] = (await dmsLifecycleService.getApiCall(`Circular/GetVesselAckList/${circularId}`)) || [];
            setAckList(ackList);
            setFilteredAckList(ackList);

            // Unique vessels for the filter dropdown
            const vessels = Array.from(new Set(ackList.map(item => item.vslName)));
            setVesselOptions([{ label: 'All Vessels', value: 'all' }, ...vessels.map(v => ({ label: v, value: v }))]);
            setVesselFilter('all');
        } catch (err) {
            setAckList([]);
            setFilteredAckList([]);
            notify.error(errorMessage(err), 'Could not load acknowledgements');
        } finally {
            setAckLoading(false);
        }
    };
    
    /** Priority text: the API sometimes sends 1/2/3 instead of High/Medium/Low. */
    const priorityLabel = (priority: unknown): string => {
        const p = String(priority ?? '').trim();
        return ({ '1': 'High', '2': 'Medium', '3': 'Low' } as Record<string, string>)[p] || p;
    };

    const getPriorityIcon = (priority: string) => {
        switch (priorityLabel(priority)) {
            case 'High': return 'pi-exclamation-triangle';
            case 'Medium': return 'pi-info-circle';
            case 'Low': return 'pi-check-circle';
            default: return 'pi-circle';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Active': return 'pi-check-circle';
            case 'Draft': return 'pi-file-edit';
            case 'Cancelled': return 'pi-ban';
            case 'Archived': return 'pi-inbox';
            default: return 'pi-circle';
        }
    };

    const getAckStatusColor = (status: string) => {
        switch (status) {
            case 'Acknowledged': return 'success';
            case 'Pending': return 'warning';
            case 'Overdue': return 'danger';
            default: return 'info';
        }
    };

    const ackStatusBodyTemplate = (rowData: AckList) => {
        return <Tag value={rowData.status} severity={getAckStatusColor(rowData.status)} />;
    };

    const handleEdit = (id: number) => {
        const circularToEdit = circulars.find(c => c.ciR_MasterID === id) || null;
        if (!canEditCircular(circularToEdit)) {
            notify.info('Only a draft can be edited. A released or cancelled circular cannot be changed.');
            return;
        }
        setSelectedCircular(circularToEdit);  
        setSelectedAction('Edit');
        setIsAddDialogVisible(true);
    };

    const [downloadingId, setDownloadingId] = useState<number | null>(null);

    /** Downloads the circular's attachment (the file saved with it). */
    const handleDownload = async (id: number) => {
        if (!id || downloadingId === id) return;
        const circular = circulars.find(c => c.ciR_MasterID === id);
        setDownloadingId(id);
        try {
            const data = await dmsLifecycleService.getApiCall<CircularFileDto | null>(`circular/GetCIRDetails/${id}`);
            const bytes = attachmentBytes(data?.blobContents);
            if (!bytes || bytes.length === 0) {
                notify.info('This circular has no attachment.');
                return;
            }
            const number = data?.ciR_Number || circular?.ciR_Number || `circular-${id}`;
            const fileName: string = data?.fileName || data?.description || `${number}.${(data?.fileType || 'pdf').replace(/^\./, '')}`;
            const ext = (fileName.split('.').pop() || '').toLowerCase();
            const mimeType = ATTACHMENT_TYPES[ext]
                || (String(data?.originalFileType || '').includes('/') ? data?.originalFileType : undefined)
                || (String(data?.fileType || '').includes('/') ? data?.fileType : undefined);
            saveFile(bytes, fileName, mimeType);
        } catch (err) {
            notify.error(errorMessage(err), 'Could not download the attachment');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleLog = (id: number) => {
        const circularToLog = circulars.find(c => c.ciR_MasterID === id) || null;
        setSelectedCircular(circularToLog);
        setShowCircularsLogDialog(true);
    };

    const term = searchTerm.trim().toLowerCase();
    const matchesCategory = (categoryId: number | undefined) =>
        filterCategory === -1 || String(categoryId) === String(filterCategory);

    const priorityRank: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    const filteredCirculars = useMemo(() => {
        const list = circulars.filter(circular => {
            const matchesSearch = term === '' ||
                (circular.title || '').toLowerCase().includes(term) ||
                (circular.ciR_Number || '').toLowerCase().includes(term) ||
                (circular.reference || '').toLowerCase().includes(term);
            return matchesSearch && matchesCategory(circular.ciR_CategoryID);
        });
        const time = (c: Circular) => new Date(c.dateIssued).getTime() || 0;
        return [...list].sort((a, b) => {
            if (sortOrder === 'oldest') return time(a) - time(b);
            if (sortOrder === 'priority') return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || time(b) - time(a);
            return time(b) - time(a); // newest
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [circulars, term, filterCategory, sortOrder]);

    /** Tree view: same search and category filter; categories stay when one of their circulars matches. */
    const filteredNodes = useMemo(() => {
        if (term === '' && filterCategory === -1) return nodes;
        const keep = (list: TreeNodeData[]): TreeNodeData[] => list.reduce<TreeNodeData[]>((acc, node) => {
            const children = node.children ? keep(node.children as TreeNodeData[]) : [];
            const isLeaf = !node.data?.isCategory;
            const textMatch = term === '' || String(node.label || '').toLowerCase().includes(term) ||
                (node.data?.ciR_Number || '').toLowerCase().includes(term);
            if ((isLeaf && textMatch && matchesCategory(node.data?.ciR_CategoryID)) || children.length) {
                acc.push({ ...node, children });
            }
            return acc;
        }, []);
        return keep(nodes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, term, filterCategory]);

    /** While searching or filtering, open every category so the matches are visible. */
    const treeExpandedKeys = useMemo(() => {
        if (term === '' && filterCategory === -1) return expandedKeys;
        const keys: { [key: string]: boolean } = {};
        const walk = (list: TreeNodeData[]) => list.forEach((n) => {
            if (n.children?.length) { keys[String(n.key)] = true; walk(n.children as TreeNodeData[]); }
        });
        walk(filteredNodes);
        return keys;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredNodes, expandedKeys]);

    const countTreeLeaves = (list: TreeNodeData[]): number =>
        list.reduce((n, node) => n + (node.data?.isCategory ? 0 : 1) + countTreeLeaves((node.children || []) as TreeNodeData[]), 0);
    const visibleCount = viewMode === 'tree' ? countTreeLeaves(filteredNodes) : filteredCirculars.length;
    const totalCount = viewMode === 'tree' ? countTreeLeaves(nodes) : circulars.length;

    const itemTemplate = (circular: Circular) => {
        const isSelected = selectedCircular?.ciR_MasterID === circular.ciR_MasterID;
        const priority = priorityLabel(circular.priority).toLowerCase();
        const status = (circular.statusString || '').toLowerCase();
        const stop = (e: React.MouseEvent) => e.stopPropagation();

        return (
            <div
                className={`circular-row priority-${priority}${isSelected ? ' selected' : ''}`}
                data-circular-id={circular.ciR_MasterID}
                onClick={() => setSelectedCircular(circular)}
                onContextMenu={(e) => onListContextMenu(e, circular)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedCircular(circular); }}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
            >
                <div className="row-top">
                    <span className="row-number">{circular.ciR_Number}</span>
                    <span className="row-meta"><i className="pi pi-folder" />{circular.category}</span>
                    <span className="row-meta"><i className="pi pi-calendar" />{formatDate(circular.dateIssued)}</span>
                    <span className="row-pills">
                        <span className={`custom-tag priority-${priority}`}>{priorityLabel(circular.priority)}</span>
                        <span className={`custom-tag status-${status}`}>{circular.statusString}</span>
                    </span>
                </div>
                <div className="row-title">{circular.title}</div>
                <div className="row-bottom">
                    <span className="row-ref">{circular.reference || ''}</span>
                    
                    <span className="row-actions" onClick={stop}>
                        {/* A plain title on a wrapper: PrimeReact's tooltip on a disabled button breaks when the button changes. */}
                        <span title={canEditCircular(circular) ? 'Edit' : 'Released or cancelled: cannot be edited'} className="row-action-wrap">
                            <Button icon="pi pi-pencil" className="p-button-text p-button-rounded p-button-sm" onClick={() => handleEdit(circular.ciR_MasterID)}
                                disabled={!canEditCircular(circular)} aria-label="Edit" />
                        </span>
                        <Button icon={downloadingId === circular.ciR_MasterID ? 'pi pi-spin pi-spinner' : 'pi pi-download'} className="p-button-text p-button-rounded p-button-sm" onClick={() => handleDownload(circular.ciR_MasterID)} disabled={!hasAttachment(circular) || downloadingId === circular.ciR_MasterID} tooltip={hasAttachment(circular) ? 'Download attachment' : 'No attachment'} tooltipOptions={{ position: 'top' }} aria-label={hasAttachment(circular) ? 'Download attachment' : 'No attachment'} />
                        <Button icon="pi pi-history" className="p-button-text p-button-rounded p-button-sm" onClick={() => handleLog(circular.ciR_MasterID)} tooltip="Activity log" tooltipOptions={{ position: 'top' }} aria-label="Activity log" />
                        <Button
                            icon={circular.isFavourite ? 'pi pi-star-fill' : 'pi pi-star'}
                            className={`p-button-text p-button-rounded p-button-sm circular-favourite-action${circular.isFavourite ? ' is-favourite' : ''}`}
                            onClick={() => handleFavourite(circular.ciR_MasterID)}
                            tooltip={circular.isFavourite ? (isFavoritesMode ? 'Remove from favourites' : 'Added to favourites') : 'Add to favourites'}
                            tooltipOptions={{ position: 'top' }}
                            aria-label={circular.isFavourite ? (isFavoritesMode ? 'Remove from favourites' : 'Added to favourites') : 'Add to favourites'}
                        />
                    </span>
                </div>
            </div>
        );
    };

    // Open the circular named in the address (?id=) once the list and the tree have loaded; once per address,
    // so later changes to the list (favourites, edits) do not pull the selection back.
    const focusApplied = useRef<string | null>(null);
    useEffect(() => {
        const focusKey = `${calledMode}|${focusId}`;
        if (!focusId || loading || circulars.length === 0 || focusApplied.current === focusKey) return;
        const circular = circulars.find((c) => String(c.ciR_MasterID) === focusId);
        if (!circular) {
            focusApplied.current = focusKey;
            notify.warn(`That ${mode ? mode.toLowerCase().replace(/s$/, '') : 'circular'} is not in this list. It may have been cancelled, expired or deleted.`, 'Not found');
            return;
        }
        setSelectedCircular(circular);
        // Same item in the tree view: select it and open its category.
        const path: string[] = [];
        const walk = (list: TreeNodeData[], trail: string[]): boolean => {
            for (const node of list) {
                const here = [...trail, String(node.key)];
                if (!node.data?.isCategory && node.data?.ciR_MasterID === circular.ciR_MasterID) { path.push(...here); return true; }
                if (node.children && walk(node.children as TreeNodeData[], here)) return true;
            }
            return false;
        };
        if (walk(nodes, [])) {
            setSelectedNodeKey(path[path.length - 1]);
            setExpandedKeys((prev) => ({ ...prev, ...Object.fromEntries(path.slice(0, -1).map((k) => [k, true])) }));
        }
        if (nodes.length > 0) focusApplied.current = focusKey; // the tree may still be loading: try again when it arrives
        window.setTimeout(() => document.querySelector(`[data-circular-id="${circular.ciR_MasterID}"]`)?.scrollIntoView({ block: 'center' }), 50);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusId, loading, circulars, nodes]);

    const findNodeByKey = (nodes: TreeNodeData[], key: string): TreeNodeData | null => {
        for (const node of nodes) {
            if (node.key === key) {
                return node;
            }
            if (node.children) {
                const found = findNodeByKey(node.children as TreeNodeData[], key);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    };


    const updateFavouriteState = (id: number, isFavourite: boolean) => {
        setCirculars(previous => previous.map(circular =>
            circular.ciR_MasterID === id ? { ...circular, isFavourite } : circular
        ));
        const updateTreeNodes = (treeNodes: TreeNodeData[]): TreeNodeData[] =>
            treeNodes.map(node => ({
                ...node,
                data: node.data?.ciR_MasterID === id ? { ...node.data, isFavourite } : node.data,
                children: node.children
                    ? updateTreeNodes(node.children as TreeNodeData[])
                    : node.children
            }));
        setNodes(previous => updateTreeNodes(previous));
        setSelectedCircular(previous =>
            previous?.ciR_MasterID === id ? { ...previous, isFavourite } : previous
        );
    };

    const handleFavourite = async (id: number) => {
        if (!id) return;
        const circular = circulars.find(item => item.ciR_MasterID === id);
        const isFavourite = circular?.isFavourite ?? selectedCircular?.isFavourite ?? false;
        if (isFavourite) {
            confirmDialog({
                header: 'Remove from favourites?',
                message: 'Are you sure you want to remove this circular from your favourites?',
                icon: 'pi pi-exclamation-triangle',
                acceptLabel: 'Remove',
                rejectLabel: 'Cancel',
                className: 'dms-confirm-dialog',
                acceptClassName: 'dms-confirm-danger',
                rejectClassName: 'p-button-text p-button-secondary',
                defaultFocus: 'reject',
                draggable: false,
                accept: () => updateFavourite(id, false)
            });
            return;
        }
        await updateFavourite(id, true);
    };

    const updateFavourite = async (id: number, isFavourite: boolean) => {
        const previousValue = circulars.find(item => item.ciR_MasterID === id)?.isFavourite
            ?? selectedCircular?.isFavourite
            ?? false;
        updateFavouriteState(id, isFavourite);
        try {
            const action = isFavourite ? 'AddToFavourite' : 'RemoveFromFavourite';
            await dmsLifecycleService.postApiCall(`Circular/${action}?cir_MasterID=${id}&circularType=${calledMode ?? ''}`);
            notify.success(isFavourite ? 'Added to your favourites.' : 'Removed from your favourites.');
            if (!isFavourite && isFavoritesMode) {
                setCirculars(previous => previous.filter(circular => circular.ciR_MasterID !== id));
                setSelectedCircular(previous => previous?.ciR_MasterID === id ? null : previous);
                const removeFromTree = (treeNodes: TreeNodeData[]): TreeNodeData[] =>
                    treeNodes.flatMap(node => {
                        if (node.data?.ciR_MasterID === id) return [];
                        const children = node.children ? removeFromTree(node.children as TreeNodeData[]) : undefined;
                        if (node.data?.isCategory && children?.length === 0) return [];
                        return [{ ...node, ...(children ? { children } : {}) }];
                    });
                setNodes(previous => removeFromTree(previous));
            }
        } catch (err) {
            updateFavouriteState(id, previousValue);
            notify.error(errorMessage(err), isFavourite ? 'Could not add to favourites' : 'Could not remove from favourites');
        }
    };

    const handleNewCircular = () => {
        setSelectedAction('Add');
        setIsAddDialogVisible(true);
    };
    
    const updateCIR = async (data: CircularFormData, options?: { release?: boolean }) => {
        try {
            setIsAddDialogVisible(false);

            const typeWord = mode === 'Alerts' ? 'alert' : 'circular';
            const released = () => notify.success(`Saved and released. The vessels get the ${typeWord} with the next sync.`);

            let response: unknown;
            if (selectedAction === 'Add') {
                response = await dmsLifecycleService.postApiCall<unknown>('Circular/AddCircular', data);
            }
            else if (options?.release) {
                // Save and release in one call (PUT Circular/ReleaseCircular, same body as EditCircular).
                // When it is refused nothing is saved, so the changes are then kept as a draft.
                try {
                    response = await dmsLifecycleService.putApiCall('Circular/ReleaseCircular', data);
                    released();
                } catch (err) {
                    response = await dmsLifecycleService.putApiCall('Circular/EditCircular', data);
                    notify.error(errorMessage(err), 'Saved as a draft, but not released');
                }
            }
            else {
                response = await dmsLifecycleService.putApiCall('Circular/EditCircular', data);
            }

            setIsAddDialogVisible(false);

            // AddCircular returns the new circular's ID; EditCircular keeps the same one.
            const savedId: number | null = selectedAction === 'Add'
                ? (typeof response === 'number' ? response : Number((response as { ciR_MasterID?: number } | null)?.ciR_MasterID) || null)
                : data.ciR_MasterID;
            // A new circular is saved first, then released (POST Circular/{id}/Release).
            if (selectedAction === 'Add' && options?.release && savedId) {
                try {
                    await featureApi.circular.release(savedId);
                    released();
                } catch (err) {
                    notify.error(errorMessage(err), 'Saved as a draft, but not released');
                }
            }

            const list = await fetchCirculars();
            if (selectedAction === 'Add') {
                await LoadTreeNodeData();
                // Select the new circular in the refreshed list.
                setSelectedCircular(list.find((c) => c.ciR_MasterID === savedId) ?? null);
            } else {
                await LoadTreeNodeData();
                setSelectedCircular((current) => current?.ciR_MasterID === data.ciR_MasterID
                    ? (list.find((c) => c.ciR_MasterID === data.ciR_MasterID) ?? current)
                    : current);
            }
                      
        } catch (err: unknown) {
            // Show the failure: before, a rejected save looked like it had worked.
            notify.error(errorMessage(err), selectedAction === 'Add' ? `Could not add the ${mode === 'Alerts' ? 'alert' : 'circular'}` : 'Could not save the changes');
            dispatch(setError(errorMessage(err, 'Error saving circular')));
        }
    }

    return (
        <div className='main-page-wrapper'>
            <ConfirmDialog />
            <ContextMenu 
                model={menuItems} 
                ref={cm} 
                className="circular-context-menu"
            />
            <PageHeader
                title={headerTitle}
                actions={<Button icon="pi pi-plus" label={`New ${itemLabel.toLowerCase()}`} onClick={handleNewCircular} className="header-primary-btn" />}
            />
            
            <div className={`circulars-split-container${isFavoritesMode ? ' circulars-favorites-mode' : ''}`}>
                <div className="circulars-list-section">
                    {isFavoritesMode && (
                        <div className="circular-favorites-heading">
                            <span className="circular-favorites-icon"><i className="pi pi-star-fill" aria-hidden="true" /></span>
                            <div>
                                <h2>My favourites</h2>
                                <p>Your saved {mode.toLowerCase()} in one place. Use the star to remove an item.</p>
                            </div>
                            <span className="circular-favorites-count">{loading ? '—' : circulars.length}</span>
                        </div>
                    )}
                    {/* Toolbar: fixed two-row layout, so nothing moves when the view changes. */}
                    <div className="list-controls">
                        <div className="controls-row">
                            <span className="search-box">
                                <i className="pi pi-search" />
                                <InputText
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder={`Search ${mode.toLowerCase() || 'circulars'} by title, number or reference`}
                                    className="search-input"
                                    aria-label={`Search ${mode}`}
                                />
                                {searchTerm && (
                                    <button type="button" className="search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                                        <i className="pi pi-times" />
                                    </button>
                                )}
                            </span>
                            <SelectButton
                                className="view-switcher"
                                value={viewMode}
                                options={viewOptions}
                                optionValue="value"
                                onChange={(e) => {
                                    if (e.value !== null) {
                                        setViewMode(e.value);
                                    }
                                }}
                                itemTemplate={(option) => (
                                    <span className="view-option" title={option.label} aria-label={option.label}>
                                        <i className={option.icon}></i>
                                    </span>
                                )}
                            />
                        </div>
                        <div className="controls-row">
                            <Dropdown
                                value={filterCategory}
                                options={categoryOptions}
                                onChange={(e) => setFilterCategory(e.value)}
                                placeholder="All categories"
                                className="category-filter"
                                aria-label="Category"
                            />
                            <Dropdown
                                value={sortOrder}
                                options={sortOptions}
                                onChange={(e) => setSortOrder(e.value)}
                                className="sort-filter"
                                aria-label="Sort"
                                disabled={viewMode === 'tree'}
                                tooltip={viewMode === 'tree' ? 'The tree is ordered by category' : undefined}
                                tooltipOptions={{ position: 'bottom', showOnDisabled: true }}
                            />
                            <span className="results-count" aria-live="polite">
                                {loading ? '' : visibleCount === totalCount ? `${totalCount} ${mode.toLowerCase()}` : `${visibleCount} of ${totalCount}`}
                            </span>
                        </div>
                    </div>

                    <div className="list-content">
                        {loading ? (
                            <div className="skeleton-list">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="skeleton-item">
                                        <Skeleton width="100%" height="150px" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            viewMode === 'tree' ? (
                            <Tree
                                value={filteredNodes}
                                emptyMessage={`No ${mode.toLowerCase()} found`}
                                selectionMode="single"
                                selectionKeys={selectedNodeKey}
                                onSelectionChange={onSelectionChange}
                                expandedKeys={treeExpandedKeys}
                                onToggle={(e) => {
                                    setExpandedKeys(e.value);
                                    cm.current?.hide(e.originalEvent);
                                }}
                                className="custom-tree"
                                nodeTemplate={treeNodeTemplate}
                                onContextMenu={onTreeContextMenu}
                            />
                            ) : viewMode === 'grid' ? (
                                filteredCirculars.length === 0 ? (
                                    <div className="list-empty"><i className="pi pi-search" /> No {mode.toLowerCase()} match the search or category.</div>
                                ) : (
                                <div className="circulars-grid">
                                    {filteredCirculars.map((circular) => {
                                        const isSelected = selectedCircular?.ciR_MasterID === circular.ciR_MasterID;
                                        return (
                                            <div 
                                                key={circular.ciR_MasterID} 
                                                className={`grid-item ${isSelected ? 'selected' : ''}`} 
                                                onClick={() => setSelectedCircular(circular)}
                                            >
                                                <div className="grid-item-header">
                                                    <h4>{circular.ciR_Number}</h4>
                                                    <Button
                                                        type="button"
                                                        icon={downloadingId === circular.ciR_MasterID ? 'pi pi-spin pi-spinner' : 'pi pi-download'}
                                                        className="p-button-text p-button-rounded p-button-sm circular-download-action"
                                                        disabled={!hasAttachment(circular) || downloadingId === circular.ciR_MasterID}
                                                        aria-label={hasAttachment(circular) ? 'Download attachment' : 'No attachment'}
                                                        tooltip={hasAttachment(circular) ? 'Download attachment' : 'No attachment'}
                                                        tooltipOptions={{ position: 'top' }}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleDownload(circular.ciR_MasterID);
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        icon={circular.isFavourite ? 'pi pi-star-fill' : 'pi pi-star'}
                                                        className={`p-button-text p-button-rounded p-button-sm circular-favourite-action${circular.isFavourite ? ' is-favourite' : ''}`}
                                                        aria-label={circular.isFavourite ? (isFavoritesMode ? 'Remove from favourites' : 'Added to favourites') : 'Add to favourites'}
                                                        tooltip={circular.isFavourite ? (isFavoritesMode ? 'Remove from favourites' : 'Added to favourites') : 'Add to favourites'}
                                                        tooltipOptions={{ position: 'top' }}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleFavourite(circular.ciR_MasterID);
                                                        }}
                                                    />
                                                </div>
                                                <div className="grid-item-title" title={circular.title}>{circular.title}</div>
                                                <div className="meta-left">
                                                    <div className="meta-item">
                                                        <i className="pi pi-folder"></i>
                                                        <span>{circular.category}</span>
                                                        <i className="pi pi-calendar"></i>
                                                        <span>{formatDate(circular.dateIssued)}</span>
                                                    </div>
                                                    {circular.attachmentCount > 0 && (
                                                        <div className="meta-item">
                                                            <i className="pi pi-paperclip"></i>
                                                            <span>{circular.attachmentCount} attachment{circular.attachmentCount > 1 ? 's' : ''}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                )
                            ) : (
                                <DataView
                                    value={filteredCirculars}
                                    itemTemplate={itemTemplate}
                                    layout="list"
                                    paginator={filteredCirculars.length > 8}
                                    rows={8}
                                    paginatorPosition="bottom"
                                    emptyMessage={`No ${mode.toLowerCase()} match the search or category.`}
                                    className="circulars-dataview"
                                />
                            )
                        )}
                    </div>
                </div>
                <div className="ack-list-section">
                    <div className="section-header">
                        <h2><i className="pi pi-check-square"></i> Acknowledgment Status</h2>
                    </div>
                    {selectedCircular ? (
                        <>
                            <div className="selected-circular-info">
                                <div className="circular-header">
                                    <div className="circular-details">
                                        <div className="circular-eyebrow">
                                            <span>{selectedCircular.ciR_Number}</span>
                                            <span className={`custom-tag priority-${priorityLabel(selectedCircular.priority).toLowerCase()}`}>
                                                <i className={`pi ${getPriorityIcon(selectedCircular.priority)}`}></i>
                                                {priorityLabel(selectedCircular.priority)}
                                            </span>
                                            <span className={`custom-tag status-${(selectedCircular.statusString || '').toLowerCase()}`}>
                                                <i className={`pi ${getStatusIcon(selectedCircular.statusString)}`}></i>
                                                {selectedCircular.statusString}
                                            </span>
                                        </div>
                                        <h3>{selectedCircular.title}</h3>
                                        <p>{selectedCircular.reference || 'No reference provided'}</p>
                                        <div className="circular-meta">
                                            <span><i className="pi pi-folder" />{selectedCircular.category}</span>
                                            <span><i className="pi pi-calendar" />Issued {formatDisplayDate(selectedCircular.dateIssued)}</span>
                                            <span className="circular-release-download">
                                                <span><i className="pi pi-send" />Released {formatDisplayDate(selectedCircular.releasedDate)}</span>
                                                <button type="button" className="cir-attachment-link" onClick={() => handleDownload(selectedCircular.ciR_MasterID)}
                                                    disabled={!hasAttachment(selectedCircular) || downloadingId === selectedCircular.ciR_MasterID}
                                                    title={hasAttachment(selectedCircular) ? 'Download the attachment' : 'No attachment'}>
                                                    <i className={`pi ${downloadingId === selectedCircular.ciR_MasterID ? 'pi-spin pi-spinner' : 'pi-download'}`} />
                                                    Download attachment
                                                </button>
                                            </span>
                                            {!!selectedCircular.cIRLevel && <span><i className="pi pi-sitemap" />Level {selectedCircular.cIRLevel}</span>}
                                        </div>
                                    </div>
                                </div>
                                {selectedCircular.remarks && (
                                    <div className="circular-message">
                                        <span className="summary-label">Message / Remarks</span>
                                        <p>{selectedCircular.remarks}</p>
                                    </div>
                                )}
                                <CircularExtrasPanel circularId={selectedCircular.ciR_MasterID}
                                    onChanged={() => { fetchCirculars(); LoadTreeNodeData(); }} />
                                {/* Acknowledgement counts on one line */}
                                <div className="circular-summary-line" aria-label="Acknowledgement counts">
                                    <span className="summary-chip ack">
                                        <i className="pi pi-check-circle" /> Acknowledged <strong>{ackList.filter((item) => item.status === 'Acknowledged').length}</strong>
                                    </span>
                                    <span className="summary-chip pending">
                                        <i className="pi pi-clock" /> Pending <strong>{ackList.filter((item) => item.status === 'Pending').length}</strong>
                                    </span>
                                    <span className="summary-chip overdue">
                                        <i className="pi pi-exclamation-circle" /> Overdue <strong>{ackList.filter((item) => item.status === 'Overdue').length}</strong>
                                    </span>
                                    <span className="summary-right">
                                    <span className="summary-total">{ackList.length} total</span>
                                    {/* Vessel filter for the acknowledgement grid below */}
                                    <Dropdown
                                        inputId="vessel-filter"
                                        value={vesselFilter}
                                        options={vesselOptions}
                                        onChange={(e) => setVesselFilter(e.value)}
                                        placeholder="Select Vessel"
                                        aria-label="Filter acknowledgements by vessel"
                                        className="summary-vessel-filter"
                                        filter={vesselOptions.length > 10}
                                    />
                                    </span>
                                </div>
                            </div>
                    
                            <div className="ack-table-container">
                                {ackLoading ? (
                                    <div className="skeleton-table">
                                        <Skeleton width="100%" height="300px" />
                                    </div>
                                ) : (
                                    <DataTable 
                                        value={filteredAckList} 
                                        className="ack-table"
                                        scrollable 
                                        scrollHeight="flex"
                                        stripedRows
                                        paginator
                                        rows={10}
                                        rowsPerPageOptions={[10, 20, 50]}
                                        emptyMessage="No acknowledgment records found"
                                    >
                                        <Column field="vslName" header="Vessel Name" sortable />
                                        <Column field="acknowledgedBy" header="Acknowledged By" sortable />
                                        <Column field="dateRead" header="Date" sortable body={(row: AckList) => formatDate(row.dateRead, '')} />
                                        <Column field="status" header="Status" body={ackStatusBodyTemplate} sortable />
                                        <Column field="remarks" header="Remarks" />
                                    </DataTable>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="no-selection">
                            <i className="pi pi-info-circle" style={{ fontSize: '3rem', color: 'var(--text-secondary)' }}></i>
                            <h3>No {itemLabel.toLowerCase()} selected</h3>
                            <p>Select a {itemLabel.toLowerCase()} from the list to see who has acknowledged it.</p>
                        </div>
                    )}
            </div>
        </div>
        {showCircularsLogDialog && (
            <Dialog
                className="circular-log-dialog"
                header={`${mode === 'Circulars' ? 'Circular' : 'Alert'} Log Details`}
                visible={showCircularsLogDialog}
                style={{ width: '94vw', maxWidth: '1500px', height: '88vh', maxHeight: '92vh' }}
                contentStyle={{ padding: '0.75rem', backgroundColor: '#f8fafc' }}
                onHide={() => { if (!showCircularsLogDialog) return; setShowCircularsLogDialog(false); }}>
                    <CircularsLogDetails selectedCIR_MasterID ={selectedCircular?.ciR_MasterID || 0 } />
            </Dialog>
        )}

        {isAddDialogVisible && (
              <Dialog
                visible={isAddDialogVisible}
                header={
                    <div className="dialog-header-content">
                        <i className={mode === 'Circulars' ? 'pi pi-inbox' : 'pi pi-bell'}></i>
                        <span>{selectedAction === 'Edit' ? 'Edit' : 'Add New'} {mode === 'Circulars' ? 'Circular' : 'Alert'}</span>
                    </div>
                }
                style={{ width: 'min(1200px, 96vw)', height: 'min(880px, 94vh)' }}
                onHide={() => { if (!isAddDialogVisible) return; setIsAddDialogVisible(false); }}
                className="cir-editor-dialog"
                closeOnEscape={false}
                modal
                draggable={false}
            >
                <AddEditCircular
                    onSubmit={updateCIR}
                    onCancel={() => setIsAddDialogVisible(false)}
                    circularType={mode}
                    selectedAction={selectedAction}
                    selectedCIR_MasterID={(selectedAction==='Add') ? -1 : selectedCircular?.ciR_MasterID || 0}
                />
            </Dialog>
        )}
    </div>
    );
};

export default CircularsList;