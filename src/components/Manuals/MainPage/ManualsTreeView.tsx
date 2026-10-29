import React, { useImperativeHandle, forwardRef, useState, useRef, useEffect } from 'react';
import { Tree, type TreeProps, type TreeEventNodeEvent } from "primereact/tree";
import { TreeNode } from 'primereact/treenode';
import { Dialog } from 'primereact/dialog';
import { ContextMenu } from 'primereact/contextmenu';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import { setError, setSelectedManualNodeObj } from '../../../store/slices/appSlice';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import type { ContextMenu as ContextMenuType } from 'primereact/contextmenu';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import 'primereact/resources/themes/lara-light-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import dmsLifecycleService, { errorMessage } from '../../../services/DMSLifecycleService';
import AddEditManual, { type ManualFormData } from '../AddEditManual/AddEditManual';
import VesselDetails, { type VesselFormData } from '../../VesselDetails/VesselDetails';
import ManualDetails from '../ViewManuals/ManualDetails';
import ManualAckList from '../ViewManuals/ManualAckList';
import notify from '../../../services/notify';

export interface ManualsTreeViewProps {
    userId: string;
    /** Dashboard/menu filter (?mode=). Matches are selectable; their parents are shown disabled. */
    calledMode?: string;
    /** Manual to select and show when the tree has loaded (?id= in the address). */
    focusManualId?: string;
}

interface TreeNodeData extends TreeNode {
    data: {
        dM_ManualID: number;
        dM_ManualVersionID: number;
        parentID: number;
        manualLevel: number;
    };
}

/** What the Manuals page can ask of the tree (ref). */
export interface ManualsTreeViewHandle {
    refreshTree: () => void;
}

type TreeSelectionEvent = Parameters<NonNullable<TreeProps['onSelectionChange']>>[0];
type TreeNodeClickEvent = Parameters<NonNullable<TreeProps['onNodeClick']>>[0];

/** A node's key as the tree compares it (keys come from the API as numbers or strings). */
const keyOf = (node: TreeNode | null | undefined): string | null => (node?.key == null ? null : String(node.key));

/** Find a node by key without changing the selected manual. */
const findNode = (list: TreeNode[], key: string | null): TreeNode | null => {
    if (key == null) return null;
    for (const node of list) {
        if (keyOf(node) === key) return node;
        const child = node.children ? findNode(node.children, key) : null;
        if (child) return child;
    }
    return null;
};

/** Keys of every node that has children (for expanding a filtered tree). */
const allBranchKeys = (list: TreeNode[], keys: { [key: string]: boolean } = {}) => {
    for (const node of list) {
        if (node.children && node.children.length) {
            keys[String(node.key)] = true;
            allBranchKeys(node.children, keys);
        }
    }
    return keys;
};

/** First node the user may select (parents shown only for context have selectable = false). */
const firstSelectable = (list: TreeNode[]): TreeNode | null => {
    for (const node of list) {
        if (node.selectable !== false) return node;
        const child = node.children ? firstSelectable(node.children) : null;
        if (child) return child;
    }
    return null;
};

/** The nodes whose label (or a child's) contains the search text, with their parents. */
const filterTree = (list: TreeNode[], searchTerm: string): TreeNodeData[] => {
    const filtered: TreeNodeData[] = [];
    const term = searchTerm.toLowerCase();
    for (const node of list) {
        const labelMatch = String(node.label ?? '').toLowerCase().includes(term);
        const childrenMatch = node.children ? filterTree(node.children, searchTerm) : [];
        if (labelMatch || childrenMatch.length > 0) {
            filtered.push({ ...(node as TreeNodeData), children: childrenMatch.length > 0 ? childrenMatch : undefined });
        }
    }
    return filtered;
};

const ManualsTreeView = forwardRef<ManualsTreeViewHandle, ManualsTreeViewProps>(({ userId, calledMode, focusManualId }, ref) => {
    const dispatch = useDispatch();
    const appInfo = useSelector((state: RootState) => state.appInfo);
    const [nodes, setNodes] = useState<TreeNodeData[]>([]);
    const [allNodes, setAllNodes] = useState<TreeNodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
    const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null | undefined>(null);
    const [searchValue, setSearchValue] = useState('');
    const [contextMenuSelectionKey, setContextMenuSelectionKey] = useState<string | null>(null);
    const [expandedKeys, setExpandedKeys] = useState<{ [key: string]: boolean }>({});
    const [visibleAddEditDialog, setVisibleAddEditDialog] = useState<boolean>(false);
    const [visibleVesselDetailsDialog, setVisibleVesselDetailsDialog] = useState<boolean>(false);
    const [visibleManualDetailsDialog, setVisibleManualDetailsDialog] = useState<boolean>(false);
    const [visibleVslAckDialog, setVisibleVslAckDialog] = useState<boolean>(false);
    const [selectedAction, setSelectedAction] = useState<string>('Add');
    const [headerText, setHeaderText] = useState<string>('Add Manual');
    const [newNodeKey, setNewNodeKey] = useState<string | null>(null);
    const cm = useRef<ContextMenuType | null>(null);

    useImperativeHandle(ref, () => ({
        refreshTree
    }));

    const contextMenuItems = [
        {
            label: 'Add Manual',
            icon: 'pi pi-plus',
            items: [
                {
                    label: 'As Sub Manual',
                    icon: 'pi',
                    command: () => {
                        setVisibleAddEditDialog(true);
                        setHeaderText('Add Sub Manual : ' + selectedNodeLabel);
                        setSelectedAction('AddSubLevel');
                    }
                },
                {
                    label: 'At Same Level',
                    icon: 'pi',
                    command: () => {
                        setVisibleAddEditDialog(true);
                        setHeaderText('Add Manual');
                        setSelectedAction('AddSameLevel');
                    }
                }
            ]
        },
        {
            label: 'Edit Manual',
            icon: 'pi pi-pencil',
            command: () => { 
                setVisibleAddEditDialog(true); 
                setHeaderText('Edit Manual : ' + selectedNodeLabel); 
                setSelectedAction('Edit'); },
            disabled: !(appInfo.selectedManualNodeObj &&
                        (String(appInfo.selectedManualNodeObj.data.statusString).toUpperCase() === 'DRAFT' ||
                         String(appInfo.selectedManualNodeObj.data.statusString).toUpperCase() === 'RELEASED'))
        },
        {
            label: 'Delete ',
            icon: 'pi pi-trash',
            items: [
                {
                    label: 'Manual',
                    icon: 'pi',
                    command: () => {
                        if (selectedNodeKey) confirmManualDelete(selectedNodeKey);
                    }
                },
                {
                    label: 'Latest Version',
                    icon: 'pi',
                    command: () => {
                        if (selectedNodeKey) confirmLatestVersionDelete(selectedNodeKey);
                    }
                }
            ]
        },
        { separator: true },
        {
            label: 'Assign Manual Rights (To Ack)',
            icon: 'pi pi-user-plus',
            command: () => { 
                setVisibleVesselDetailsDialog(true); 
                setHeaderText('Assign Manual Rights'); 
                setSelectedAction('Edit'); }
        },
        { separator: true },
        {
            label: 'View Manual Details',
            icon: 'pi pi-eye',
            command: () => { 
                setVisibleManualDetailsDialog(true); 
                setHeaderText('View Manual Details : ' + selectedNodeLabel); 
            }
        },
        {
            label: 'View Manual Rights (To Ack)',
            icon: 'pi pi-check',
            command: () => { 
                setVisibleVesselDetailsDialog(true); 
                setHeaderText('View Manual Rights'); 
                setSelectedAction('View'); }
        },
        {
            label: 'View User Acks',
            icon: 'pi pi-check',
            command: () => { 
                setVisibleVslAckDialog(true); 
                setHeaderText('Acknowledgement tracking: ' + selectedNodeLabel); 
                setSelectedAction('View'); }
        }
    ];

    useEffect(() => {
        const fetchData = async () => {
            await LoadTreeNodeData();
        };

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calledMode, focusManualId]);

    const refreshTree = () => {
        setSelectedAction('Refresh')
        const fetchData = async () => {
            setNewNodeKey(appInfo.selectedManualNodeObj?.key != null ? String(appInfo.selectedManualNodeObj.key) : '');
            await LoadTreeNodeData();
        };

        fetchData();
    };

    // After a reload: select the manual just added or edited. Runs when the tree is reloaded and when the key is
    // set (an added manual's key is only known after the reload).
    const previousKey = keyOf(appInfo.selectedManualNodeObj);
    useEffect(() => {
        if (!newNodeKey) return;
        const selectedNode = findNode(nodes, newNodeKey);
        setSelectedNodeKey(newNodeKey);
        setSelectedNodeLabel(selectedNode ? selectedNode.label : null);
        setExpandedKeys(prev => ({ ...prev, [previousKey ?? '']: true })); // the parent it was added under stays open
        dispatch(setSelectedManualNodeObj(selectedNode));
        setNewNodeKey(null);
    }, [nodes, newNodeKey, previousKey, dispatch]);

    const LoadTreeNodeData = async () => {
        try {
            const modeQuery = calledMode ? `&calledMode=${encodeURIComponent(calledMode)}` : '';
            const data: TreeNodeData[] = (await dmsLifecycleService.getApiCall(`Manuals/GetTreeViewManualList?userId=${userId}${modeQuery}`)) || [];
            setAllNodes(data);
            setNodes(data);
            setSearchValue('');

            if (calledMode) {
                // Filtered: open every branch so all matches are visible, and select the first match.
                setExpandedKeys(allBranchKeys(data));
                const first = firstSelectable(data);
                setSelectedNodeKey(keyOf(first));
                setSelectedNodeLabel(first ? first.label : null);
                dispatch(setSelectedManualNodeObj(first));
                return;
            }
            
            if (selectedAction === 'AddSubLevel' || selectedAction === 'AddSameLevel' || selectedAction === 'Edit' || selectedAction === 'Refresh') {
                return;
            }
            else if (focusManualId && focusOn(data, String(focusManualId))) {
                return;
            }
            else {
                const firstNode = getFirstNodeKey(data);
                if (firstNode && firstNode.key) {
                    const firstKey = String(firstNode.key);
                    setExpandedKeys({ [firstKey]: true });
                    setSelectedNodeLabel(firstNode.label);
                    dispatch(setSelectedManualNodeObj(firstNode));
                    setSelectedNodeKey(keyOf(data[0]));
                }
            }
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The manuals could not be loaded.')));
        } finally {
            setLoading(false);
        }
    }

    /** Selects the manual with this key and opens the branches above it. False when it is not in the tree. */
    function focusOn(list: TreeNode[], key: string): boolean {
        const path: string[] = [];
        const find = (nodesList: TreeNode[]): TreeNode | null => {
            for (const node of nodesList) {
                if (String(node.key) === key) return node;
                if (node.children && node.children.length) {
                    path.push(String(node.key));
                    const hit = find(node.children);
                    if (hit) return hit;
                    path.pop();
                }
            }
            return null;
        };
        const node = find(list);
        if (!node) return false;
        const keys: { [k: string]: boolean } = {};
        path.forEach((k) => { keys[k] = true; });
        setExpandedKeys(keys);
        setSelectedNodeKey(keyOf(node));
        setSelectedNodeLabel(node.label);
        dispatch(setSelectedManualNodeObj(node));
        return true;
    }

    function getFirstNodeKey(list: TreeNodeData[]): TreeNodeData | null {
        return list && list.length > 0 ? list[0] : null;
    }
    
    const onContextMenu = (event: TreeEventNodeEvent) => {
        if (event.node.selectable === false) return; // context-only parent: no actions
        setContextMenuSelectionKey(keyOf(event.node));
        setSelectedNodeKey(keyOf(event.node));
        setSelectedNodeLabel(event.node.label);
        dispatch(setSelectedManualNodeObj(event.node));
        cm.current?.show(event.originalEvent);
    };

    const onSelectionChange = (e: TreeSelectionEvent) => {
        const key = typeof e.value === 'string' ? e.value : null; // single selection: the key itself
        const target = findNode(nodes, key);
        if (target && target.selectable === false) return; // parents shown only for context cannot be opened
        setSelectedNodeKey(key);
        setSelectedNodeLabel(target ? target.label : null);
        if (target) dispatch(setSelectedManualNodeObj(target));
    };

    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchValue(value);

        if (value.trim() === '') {
            setNodes(allNodes);
            setExpandedKeys({});
        } else {
            const filtered = filterTree(allNodes, value);
            setNodes(filtered);
            expandAll();
        }
    };

    const onNodeSelect = (event: TreeNodeClickEvent) => {
        if (event.node.selectable === false) return;
        setSelectedNodeKey(keyOf(event.node));
        setSelectedNodeLabel(event.node.label);
    };

    const expandAll = () => {
        const keys: { [key: string]: boolean } = {};

        const traverse = (list: TreeNode[]) => {
            for (const node of list) {
                if (node.children) {
                    keys[String(node.key)] = true;
                    traverse(node.children);
                }
            }
        };

        traverse(nodes);
        setExpandedKeys(keys);
    };

    const collapseAll = () => {
        setExpandedKeys({});
    };
    
    const updateManuals = async (data: ManualFormData) => {
        try {
            let url = '';
            if (selectedAction === 'AddSubLevel' || selectedAction === 'AddSameLevel') {
                url = 'Manuals/AddManual';
            } else if (selectedAction === 'Edit') {
                url = 'Manuals/EditManual';
            }

            const response = await dmsLifecycleService.postApiCall<{ manualId?: number | string } | null>(url, data);

            setVisibleAddEditDialog(false);
            if (selectedAction === 'AddSubLevel' || selectedAction === 'AddSameLevel') {
                await LoadTreeNodeData();
                setNewNodeKey(response?.manualId != null ? String(response.manualId) : null);
                setVisibleVesselDetailsDialog(true);
            } else {
                setNewNodeKey(String(data.DM_ManualID));
                await LoadTreeNodeData();
            }
                      
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The manual could not be saved.')));
        }
    }

    const updateVesselDetails = async (data: VesselFormData) => {
        try {
            const url = 'Manuals/UpdateManualRights';           
            await dmsLifecycleService.postApiCall(url, data);

            setVisibleVesselDetailsDialog(false);
            await LoadTreeNodeData();
        } catch (err: unknown) {
            dispatch(setError(errorMessage(err, 'The manual rights could not be saved.')));
        }
    }

    const confirmManualDelete = (nodeKey: string) => {
        confirmDialog({
            message: 'Are you sure you want to delete the selected manual?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => callManualDeleteAPI(nodeKey),
            reject: () => { }
        });
    };

    const callManualDeleteAPI = async (nodeKey: string) => {
        try {
            setSelectedAction('');
            await dmsLifecycleService.deleteApiCall(`Manuals/DeleteManual/${nodeKey}`);
            await LoadTreeNodeData();
        } catch (err: unknown) {
            notify.error(errorMessage(err), 'Delete failed');
        }
    };

    const confirmLatestVersionDelete = (nodeKey: string) => {
        confirmDialog({
            message: 'Are you sure you want to delete the latest version of selected manual?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => callLatestVersionDeleteAPI(nodeKey),
            reject: () => { }
        });
    };

    const callLatestVersionDeleteAPI = async (nodeKey: string) => {
        try {
            setSelectedAction('');
            // Only the latest version (the manual itself stays): api/Manuals/DeleteManualVersion.
            await dmsLifecycleService.deleteApiCall(`Manuals/DeleteManualVersion/${nodeKey}`);
            await LoadTreeNodeData();
        } catch (err: unknown) {
            notify.error(errorMessage(err), 'Delete failed');
        }
    };

    if (loading) return <div>Loading Tree.....</div>

    return (
        <div className="tree-maincontainer">
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
                <div style={{ display: 'flex', alignItems: 'center', marginRight: '10px' }}>
                    <Button 
                    label="" 
                    icon="pi pi-plus" 
                    className="treeButton compact-btn" 
                    tooltip="Expand All" 
                    onClick={expandAll}
                    style={{
                        background: 'var(--primary-color)',
                        border: '1px solid var(--primary-color)',
                        color: 'white',
                        width: '38px',
                        height: '38px',
                        minWidth: '38px',
                        padding: '0',
                        fontSize: '0.75rem'
                    }}
                />&nbsp;&nbsp;
                <Button 
                    label="" 
                    icon="pi pi-minus" 
                    className="treeButton compact-btn" 
                    tooltip="Collapse All" 
                    onClick={collapseAll}
                    style={{
                        background: 'var(--primary-color)',
                        border: '1px solid var(--primary-color)',
                        color: 'white',
                        width: '38px',
                        height: '38px',
                        minWidth: '38px',
                        padding: '0',
                        fontSize: '0.75rem'
                    }}
                />&nbsp;&nbsp;
                </div>
            </div>
            <div className="tree-view-container" style={{ padding: 0, margin: 0 }}>
                <ConfirmDialog className="manual-delete-confirm" />
                <ContextMenu 
                    model={contextMenuItems}
                    ref={cm} 
                    className="compact-contextmenu"
                    appendTo="self"
                    style={{ minWidth: '300px' }}
                    pt={{
                        root: { 
                            className: 'no-left-padding',
                            style: { paddingLeft: 0 }
                        },
                        menu: {
                            style: { paddingLeft: 0 }
                        },
                        menuitem: {
                            style: { paddingLeft: 0 }
                        },
                        action: {
                            style: { paddingLeft: '0.25rem' }
                        }
                        }} />
                <Tree
                    value={nodes}
                    selectionMode="single"
                    onNodeClick={onNodeSelect}
                    selectionKeys={selectedNodeKey}
                    onSelectionChange={onSelectionChange}
                    expandedKeys={expandedKeys}
                    onToggle={(e) => setExpandedKeys(e.value)}
                    contextMenuSelectionKey={contextMenuSelectionKey ?? undefined}
                    onContextMenu={onContextMenu}
                    emptyMessage={calledMode ? 'No manuals match this filter.' : 'No manuals found.'}
                    className="custom-tree"
                    style={{ 
                    border: 'none', 
                    padding: 0, 
                    paddingTop: '2px',
                    margin: 0,
                    background: 'var(--bg-secondary)'
                }}
                />
            </div>
            <Dialog 
                header={headerText}
                className="manual-edit-dialog"
                visible={visibleAddEditDialog}
                style={{ width: '60%', height: '220vh' }}
                contentStyle={{ padding: '0.1rem', backgroundColor: '#e5eefbff' }}
                headerStyle={{ backgroundColor: '#d2e3f9ff', borderBottom: '3px solid blue'  , height: '50px'}}
                onHide={() => { if (!visibleAddEditDialog) return; setVisibleAddEditDialog(false); }}>
                <AddEditManual
                    onSubmit={updateManuals}
                    closeForm={() => { setVisibleAddEditDialog(false); }}
                    selectedAction={selectedAction}
                    selectedManualID={selectedNodeKey ? Number(selectedNodeKey) : -1}
                    selectedManualVersionID={selectedNodeKey ? Number(appInfo.selectedManualNodeObj?.data?.dM_ManualVersionID) : -1}
                />
            </Dialog>

            <Dialog header={headerText}
                className="manual-rights-dialog"
                visible={visibleVesselDetailsDialog}
                style={{ width: '65%', maxHeight: '90vh', minWidth: '90vh' }}
                contentStyle={{ height: '100%', padding: '0.5rem', backgroundColor: '#e5eefbff' }}
                onHide={() => { if (!visibleVesselDetailsDialog) return; setVisibleVesselDetailsDialog(false); }}>
                <VesselDetails
                    manualTitle={selectedNodeLabel? selectedNodeLabel : ''}
                    onSubmit={updateVesselDetails}
                    closeForm={() => setVisibleVesselDetailsDialog(false)}
                    selectedAction={selectedAction}
                    selectedManualID={selectedNodeKey ? Number(selectedNodeKey) : -1}
                />
            </Dialog>

            <Dialog header={headerText}
                className="manual-dialog"
                visible={visibleManualDetailsDialog}
                style={{ width: '1250px', minWidth: '90vh', height: '100vh', maxHeight: '95vh' }}
                contentStyle={{ padding: '0.5rem', backgroundColor: '#e5eefbff' }}
                headerStyle={{ backgroundColor: '#d2e3f9ff', borderBottom: '3px solid blue' }}
                onHide={() => { if (!visibleManualDetailsDialog) return; setVisibleManualDetailsDialog(false); }}>
                <ManualDetails
                    closeForm={() => setVisibleManualDetailsDialog(false)}
                    dmManualVersionID={selectedNodeKey ? Number(appInfo.selectedManualNodeObj?.data?.dM_ManualVersionID) : -1}
                />
            </Dialog>

            <Dialog header={headerText}
                visible={visibleVslAckDialog}
                style={{ width: '70%', maxHeight: '90vh', minWidth: '90vh', margin: '0px' }}
                contentStyle={{ height: '100%', padding: '0.2em', backgroundColor: '#e5eefbff' }}
                headerStyle={{ backgroundColor: '#d2e3f9ff', borderBottom: '3px solid blue' }}
                onHide={() => { if (!visibleVslAckDialog) return; setVisibleVslAckDialog(false); }}>
                <ManualAckList
                    closeForm={() => setVisibleVslAckDialog(false)}
                    dm_ManualID={selectedNodeKey ? Number(appInfo.selectedManualNodeObj?.data?.dm_ManualID) : -1}
                />
            </Dialog>
        </div>
    );
});

export default ManualsTreeView;