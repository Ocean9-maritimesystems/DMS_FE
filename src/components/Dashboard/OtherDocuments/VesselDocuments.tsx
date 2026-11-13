import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import featureApi, { FileItem, FolderDocument, FolderItem, formatSize, openApiFile } from '../../../services/featureApi';
import dmsLifecycleService, { errorMessage } from '../../../services/DMSLifecycleService';
import notify from '../../../services/notify';
import { formatDate } from '../../utils/formatDate';

/**
 * One vessel's Other Documents at the office: its folders on the left, the documents on the right.
 *   - New folder: a folder for this vessel (it also appears on board with the next sync).
 *   - New document: saved at the office only, never sent to the vessel. Choose its folder, or create one on the spot.
 *   - Documents added on board come up with the sync and show here as "From vessel".
 */

const ALL = 'all';
const LOOSE = 'loose';
const NEW_FOLDER = -999;
/** PrimeReact's Dropdown treats null as 'nothing chosen', so 'Not in a folder' uses 0 in the list. */
const NO_FOLDER = 0;
/** Files one new document can have (the office API refuses more). */
const MAX_DOCUMENT_FILES = 3;

type Source = 'all' | 'vessel' | 'office';

interface OtherDocumentType {
    otherDocument_TypeID: number;
    documentType: string;
}

const sourceOf = (d: FolderDocument): { key: Exclude<Source, 'all'> | 'sent'; label: string; css: string } =>
    d.isOfficeOnly ? { key: 'office', label: 'Office only', css: 'muted' }
        : d.origin === 'VSL' ? { key: 'vessel', label: 'From vessel', css: 'info' }
        : { key: 'sent', label: 'Sent to vessel', css: 'ok' };

/** "Parent › Child" for each folder. */
const folderPaths = (folders: FolderItem[]) => {
    const byId = new Map(folders.map((f) => [f.otherDocument_FolderID, f]));
    const path = (f: FolderItem): string => {
        const parent = f.parentID ? byId.get(f.parentID) : undefined;
        return parent && parent !== f ? `${path(parent)} › ${f.folderName}` : f.folderName;
    };
    return new Map(folders.map((f) => [f.otherDocument_FolderID, path(f)]));
};

interface Props {
    vesselId: number;
    vesselName: string;
    vesselMeta?: string;
}

const VesselDocuments: React.FC<Props> = ({ vesselId, vesselName, vesselMeta }) => {
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [docs, setDocs] = useState<FolderDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<string>(ALL);
    const [search, setSearch] = useState('');
    const [source, setSource] = useState<Source>('all');
    const [folderDialog, setFolderDialog] = useState<{ edit?: FolderItem } | null>(null);
    const [newDoc, setNewDoc] = useState(false);
    const [moveDoc, setMoveDoc] = useState<FolderDocument | null>(null);
    const [filesOf, setFilesOf] = useState<{ doc: FolderDocument; files: FileItem[] } | null>(null);
    const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [tree, list] = await Promise.all([featureApi.folders.tree(), featureApi.folders.vesselDocuments(vesselId)]);
            // This vessel's folders and the folders for every vessel.
            setFolders(tree.filter((f) => f.vesselID === vesselId || f.vesselID === -1));
            setDocs(list);
        } catch (err) {
            notify.error(errorMessage(err), 'Could not load the documents');
        } finally {
            setLoading(false);
        }
    }, [vesselId]);

    useEffect(() => { setSelected(ALL); setSearch(''); setSource('all'); load(); }, [load]);

    const paths = useMemo(() => folderPaths(folders), [folders]);
    const folderIds = useMemo(() => new Set(folders.map((f) => f.otherDocument_FolderID)), [folders]);
    const selectedFolder = useMemo(() => folders.find((f) => String(f.otherDocument_FolderID) === selected) ?? null, [folders, selected]);
    const inFolder = (d: FolderDocument) => d.otherDocument_FolderID != null && folderIds.has(d.otherDocument_FolderID);

    const counts = useMemo(() => {
        const c = new Map<number, number>();
        docs.forEach((d) => { if (inFolder(d)) c.set(d.otherDocument_FolderID!, (c.get(d.otherDocument_FolderID!) ?? 0) + 1); });
        return c;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docs, folderIds]);
    const looseCount = docs.filter((d) => !inFolder(d)).length;
    const officeCount = docs.filter((d) => d.isOfficeOnly).length;
    const vesselCount = docs.filter((d) => d.origin === 'VSL').length;

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return docs
            .filter((d) => selected === ALL || (selected === LOOSE ? !inFolder(d) : String(d.otherDocument_FolderID) === selected))
            .filter((d) => source === 'all' || sourceOf(d).key === source)
            .filter((d) => !q || `${d.documentNumber} ${d.documentTitle} ${d.documentType} ${d.uploadedBy}`.toLowerCase().includes(q));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docs, selected, source, search, folderIds]);

    const openFiles = async (d: FolderDocument) => {
        try {
            const files = await featureApi.folders.documentFiles(d.otherDocumentMasterID);
            setFilesOf({ doc: d, files });
        } catch (err) {
            notify.error(errorMessage(err), 'Could not open the document');
        }
    };

    const downloadFile = async (file: FileItem) => {
        setDownloadingFileId(file.id);
        try {
            await openApiFile(featureApi.folders.documentFileUrl(file.id), file.fileName, true);
        } catch (err) {
            notify.error(errorMessage(err), 'Could not download the file');
        } finally {
            setDownloadingFileId(null);
        }
    };

    const deleteDoc = (d: FolderDocument) => confirmDialog({
        header: 'Delete document',
        message: (
            <div className="vd-move-confirm-message">
                <span className="vd-move-confirm-message__title">Delete {d.documentNumber} – {d.documentTitle}?</span>
                <span className="vd-move-confirm-message__route">
                    {d.fileCount > 0 ? `The document and its ${d.fileCount === 1 ? 'file' : `${d.fileCount} files`} are removed from this list.` : 'The document is removed from this list.'}
                </span>
            </div>
        ),
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Delete',
        acceptIcon: 'pi pi-trash',
        rejectLabel: 'Cancel',
        acceptClassName: 'p-button-danger',
        className: 'vd-move-confirm-dialog vd-delete-confirm-dialog',
        accept: async () => {
            try {
                await featureApi.folders.deleteDocument(d.otherDocumentMasterID);
                load();
            } catch (err) {
                notify.error(errorMessage(err));
            }
        },
    });

    const deleteFolder = (f: FolderItem) => confirmDialog({
        header: 'Delete folder',
        message: (
            <div className="vd-move-confirm-message">
                <span className="vd-move-confirm-message__title">Delete the folder "{f.folderName}"?</span>
                <span className="vd-move-confirm-message__route">Only an empty folder can be deleted.</span>
            </div>
        ),
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Delete',
        acceptIcon: 'pi pi-trash',
        rejectLabel: 'Cancel',
        acceptClassName: 'p-button-danger',
        className: 'vd-move-confirm-dialog vd-delete-confirm-dialog',
        accept: async () => {
            try {
                await featureApi.folders.remove(f.otherDocument_FolderID);
                setSelected(ALL);
                load();
            } catch (err) {
                notify.error(errorMessage(err));
            }
        },
    });

    // Folders as an indented list, parents before children.
    const ordered = useMemo(() => {
        const kids = new Map<number | null, FolderItem[]>();
        folders.forEach((f) => {
            const p = f.parentID && folderIds.has(f.parentID) ? f.parentID : null;
            kids.set(p, [...(kids.get(p) ?? []), f]);
        });
        const out: { f: FolderItem; depth: number }[] = [];
        const walk = (p: number | null, depth: number) =>
            (kids.get(p) ?? []).sort((a, b) => a.folderName.localeCompare(b.folderName)).forEach((f) => { out.push({ f, depth }); walk(f.otherDocument_FolderID, depth + 1); });
        walk(null, 0);
        return out;
    }, [folders, folderIds]);

    const heading = selected === ALL ? 'All documents' : selected === LOOSE ? 'Not in a folder' : paths.get(Number(selected)) ?? 'Folder';

    return (
        <div className="vd">
            <ConfirmDialog />
            <header className="vd-head">
                <div className="vd-head__title">
                    <span className="vd-head__icon"><i className="pi pi-flag" /></span>
                    <div>
                        <h3>{vesselName}</h3>
                        <span>{vesselMeta || 'Vessel'}</span>
                    </div>
                </div>
                <div className="vd-stats" aria-label="Summary">
                    <span><strong>{docs.length}</strong> {docs.length === 1 ? 'document' : 'documents'}</span>
                    <span><strong>{folders.length}</strong> {folders.length === 1 ? 'folder' : 'folders'}</span>
                    <span><strong>{vesselCount}</strong> from vessel</span>
                    <span><strong>{officeCount}</strong> office only</span>
                </div>
                <div className="vd-head__actions">
                    <Button label="New document" icon="pi pi-file-plus" onClick={() => setNewDoc(true)} />
                </div>
            </header>

            <div className="vd-body">
                <nav className="vd-folders" aria-label="Folders">
                    <div className="vd-folders__title">Folders</div>
                    <button type="button" className={`vd-folder${selected === ALL ? ' is-selected' : ''}`} aria-pressed={selected === ALL} onClick={() => setSelected(ALL)}>
                        <i className="pi pi-th-large" /><span className="vd-folder__name">All documents</span><span className="vd-folder__count">{docs.length}</span>
                    </button>
                    <button type="button" className={`vd-folder${selected === LOOSE ? ' is-selected' : ''}`} aria-pressed={selected === LOOSE} onClick={() => setSelected(LOOSE)}>
                        <i className="pi pi-inbox" /><span className="vd-folder__name">Not in a folder</span><span className="vd-folder__count">{looseCount}</span>
                    </button>
                    <div className="vd-folders__sep" />
                    {!loading && ordered.length === 0 && <div className="vd-folders__empty">No folders yet.</div>}
                    {ordered.map(({ f, depth }) => {
                        const isSel = selected === String(f.otherDocument_FolderID);
                        return (
                            <div key={f.otherDocument_FolderID} className={`vd-folder-row${isSel ? ' is-selected' : ''}`}>
                                <button type="button" className={`vd-folder${isSel ? ' is-selected' : ''}`} aria-pressed={isSel} style={{ paddingLeft: 10 + depth * 16 }}
                                    onClick={() => setSelected(String(f.otherDocument_FolderID))} title={paths.get(f.otherDocument_FolderID)}>
                                    <i className={isSel ? 'pi pi-folder-open' : 'pi pi-folder'} />
                                    <span className="vd-folder__name">{f.folderName}</span>
                                    {f.vesselID === -1 && <span className="vd-folder__tag" title="Company folder for every vessel">all vessels</span>}
                                    <span className="vd-folder__count">{counts.get(f.otherDocument_FolderID) ?? 0}</span>
                                </button>
                                {isSel && f.canEdit && (
                                    <span className="vd-folder__tools">
                                        <Button icon="pi pi-pencil" text rounded size="small" aria-label="Rename folder" tooltip="Rename" onClick={() => setFolderDialog({ edit: f })} />
                                        <Button icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete folder" tooltip="Delete" onClick={() => deleteFolder(f)} />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                    <Button className="vd-folders__add" label="New folder" icon="pi pi-folder-plus" outlined size="small"
                        onClick={() => setFolderDialog({})} />
                </nav>

                <section className="vd-docs">
                    <div className="vd-docs__bar">
                        <h4>
                            {heading}
                            {!loading && <span className="vd-docs__count">{shown.length} {shown.length === 1 ? 'document' : 'documents'}</span>}
                        </h4>
                        <span className="vd-spacer" />
                        <span className="od-search">
                            <i className="pi pi-search" />
                            <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a document" />
                        </span>
                        <SelectButton className="vd-source" value={source} onChange={(e) => e.value && setSource(e.value)}
                            options={[{ label: 'All', value: 'all' }, { label: 'From vessel', value: 'vessel' }, { label: 'Office only', value: 'office' }]} />
                    </div>
                    <DataTable value={shown} loading={loading} size="small" rowHover paginator={shown.length > 15} rows={15} dataKey="otherDocumentMasterID"
                        className="vd-table" tableClassName="vd-table__grid"
                        emptyMessage={selectedFolder
                            ? <span>This folder is empty. <Button label="Add a document here" link className="p-0" onClick={() => setNewDoc(true)} /></span>
                            : 'No documents.'}>
                        <Column field="documentNumber" header="No." sortable className="vd-col-no" headerClassName="vd-col-no" body={(d: FolderDocument) => (
                            <span className="vd-cell-ellipsis vd-doc-no" title={d.documentNumber}>{d.documentNumber || '–'}</span>
                        )} />
                        <Column field="documentTitle" header="Title" sortable className="vd-col-title" headerClassName="vd-col-title" body={(d: FolderDocument) => {
                            const sub = [d.status, d.reference].filter(Boolean).join(' · ');
                            return (
                                <>
                                    <span className="vd-doc-title" title={d.documentTitle}>{d.documentTitle || '–'}</span>
                                    {sub && <span className="vd-doc-sub" title={sub}>{sub}</span>}
                                </>
                            );
                        }} />
                        <Column field="documentType" header="Type" sortable className="vd-col-type" headerClassName="vd-col-type" body={(d: FolderDocument) => (
                            <span className="vd-cell-ellipsis" title={d.documentType}>{d.documentType || '–'}</span>
                        )} />
                        {selected === ALL && <Column field="folderName" header="Folder" sortable className="vd-col-folder" headerClassName="vd-col-folder" body={(d: FolderDocument) => (inFolder(d)
                            ? <span className="vd-cell-ellipsis" title={paths.get(d.otherDocument_FolderID!)}><i className="pi pi-folder vd-muted" /> {d.folderName}</span>
                            : <span className="vd-muted">–</span>)} />}
                        <Column header="Source" className="vd-col-source" headerClassName="vd-col-source" body={(d: FolderDocument) => {
                            const s = sourceOf(d);
                            return <span className={`feature-tag ${s.css}`}>{s.label}</span>;
                        }} />
                        <Column field="uploadedOn" header="Added" sortable className="vd-col-added" headerClassName="vd-col-added" body={(d: FolderDocument) => (
                            <span>{formatDate(d.uploadedOn)}<small className="vd-muted vd-block vd-cell-ellipsis" title={d.uploadedBy}>{d.uploadedBy}</small></span>
                        )} />
                        <Column field="fileCount" header="Files" sortable className="vd-col-files" headerClassName="vd-col-files" body={(d: FolderDocument) => (d.fileCount > 0
                            ? <Button text className="vd-files-btn" icon="pi pi-paperclip" label={String(d.fileCount)} onClick={() => openFiles(d)}
                                aria-label={`Show ${d.fileCount} ${d.fileCount === 1 ? 'file' : 'files'} for ${d.documentNumber}`} tooltip="Show files" tooltipOptions={{ position: 'top' }} />
                            : <span className="vd-muted" aria-label="No files">–</span>)} />
                        <Column header="" className="vd-col-tools" headerClassName="vd-col-tools" body={(d: FolderDocument) => (
                            <span className="vd-row-tools">
                                <Button icon="pi pi-folder" text rounded size="small" aria-label="Move to folder" tooltip="Move to folder" onClick={() => setMoveDoc(d)} />
                                {d.isOfficeOnly && (
                                    <Button icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete" tooltip="Delete" onClick={() => deleteDoc(d)} />
                                )}
                            </span>
                        )} />
                    </DataTable>
                    <footer className="vd-legend" aria-label="What the source tags mean">
                        <span className="vd-legend__item"><span className="feature-tag info">From vessel</span> added on board</span>
                        <span className="vd-legend__item"><span className="feature-tag ok">Sent to vessel</span> on board too</span>
                        <span className="vd-legend__item"><span className="feature-tag muted">Office only</span> added at the office, not sent to the vessel</span>
                    </footer>
                </section>
            </div>

            {folderDialog && (
                <FolderFormDialog vesselId={vesselId} vesselName={vesselName} folders={folders} paths={paths} edit={folderDialog.edit}
                    defaultParent={null}
                    onHide={() => setFolderDialog(null)}
                    onSaved={async (id) => { setFolderDialog(null); await load(); if (id) setSelected(String(id)); }} />
            )}
            {newDoc && (
                <NewDocumentDialog vesselId={vesselId} vesselName={vesselName} folders={folders} paths={paths}
                    defaultFolderId={selectedFolder?.canEdit ? selectedFolder.otherDocument_FolderID : null}
                    onHide={() => setNewDoc(false)}
                    onSaved={async (folderId) => { setNewDoc(false); await load(); setSelected(folderId ? String(folderId) : LOOSE); }} />
            )}
            {moveDoc && (
                <MoveDialog doc={moveDoc} folders={folders} paths={paths} onHide={() => setMoveDoc(null)}
                    onSaved={() => { setMoveDoc(null); load(); }} />
            )}
            {filesOf && (
                <Dialog className="vd-dialog" header={`${filesOf.doc.documentNumber} – ${filesOf.doc.documentTitle}`} visible onHide={() => setFilesOf(null)} style={{ width: 560, maxWidth: '96vw' }}>
                    {filesOf.files.length === 0 && <p>This document has no files.</p>}
                    {filesOf.files.map((f) => (
                        <div key={f.id} className="vd-file">
                            <Button link label={f.fileName} icon="pi pi-paperclip" className="p-0"
                                onClick={() => openApiFile(featureApi.folders.documentFileUrl(f.id), f.fileName).catch((e) => notify.error(errorMessage(e)))} />
                            <span className="vd-muted">{formatSize(f.blobSize)}</span>
                            <Button icon={downloadingFileId === f.id ? 'pi pi-spin pi-spinner' : 'pi pi-download'} text rounded
                                size="small" aria-label={`Download ${f.fileName}`} tooltip="Download file"
                                disabled={downloadingFileId !== null} onClick={() => downloadFile(f)} />
                        </div>
                    ))}
                </Dialog>
            )}
        </div>
    );
};

/** Creates a folder for this vessel, or renames one. */
const FolderFormDialog: React.FC<{
    vesselId: number;
    vesselName: string;
    folders: FolderItem[];
    paths: Map<number, string>;
    edit?: FolderItem;
    defaultParent: number | null;
    onHide: () => void;
    onSaved: (id?: number) => void;
}> = ({ vesselId, vesselName, folders, paths, edit, defaultParent, onHide, onSaved }) => {
    const [name, setName] = useState(edit?.folderName ?? '');
    const [parentId, setParentId] = useState<number | null>(edit ? edit.parentID ?? null : defaultParent);
    const [busy, setBusy] = useState(false);
    const parents = folders.filter((f) => f.vesselID === vesselId && f.canEdit && f.otherDocument_FolderID !== edit?.otherDocument_FolderID);

    const save = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            if (edit) {
                await featureApi.folders.update(edit.otherDocument_FolderID, {
                    parentId: edit.parentID ?? null, name: name.trim(), vesselId: edit.vesselID,
                });
                onSaved(edit.otherDocument_FolderID);
            } else {
                const r = await featureApi.folders.create({ parentId, name: name.trim(), vesselId });
                onSaved(r?.id);
            }
        } catch (err) {
            notify.error(errorMessage(err), 'Could not save the folder');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog className="vd-dialog" header={edit ? 'Rename folder' : `New folder for ${vesselName}`} visible onHide={onHide} style={{ width: 480, maxWidth: '96vw' }}>
            <div className="feature-form">
                <div className="field full">
                    <label htmlFor="vf-name">Folder name</label>
                    <InputText id="vf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="e.g. Class certificates" />
                </div>
                {!edit && (
                    <div className="field full">
                        <label>Inside</label>
                        <Dropdown value={parentId} showClear placeholder="Top level" filter
                            options={parents.map((f) => ({ label: paths.get(f.otherDocument_FolderID), value: f.otherDocument_FolderID }))}
                            onChange={(e) => setParentId(e.value ?? null)} />
                        <span className="hint">The folder also appears on board after the next sync, so the crew can file documents in it.</span>
                    </div>
                )}
            </div>
            <div className="vd-dialog-actions">
                <Button label="Cancel" text onClick={onHide} />
                <Button label={edit ? 'Save' : 'Create folder'} icon="pi pi-check" loading={busy} disabled={!name.trim()} onClick={save} />
            </div>
        </Dialog>
    );
};

/** A new document at the office: office only, or sent to the vessel. Pick its folder, or create a new folder on the spot. */
const NewDocumentDialog: React.FC<{
    vesselId: number;
    vesselName: string;
    folders: FolderItem[];
    paths: Map<number, string>;
    defaultFolderId: number | null;
    onHide: () => void;
    onSaved: (folderId: number | null) => void;
}> = ({ vesselId, vesselName, folders, paths, defaultFolderId, onHide, onSaved }) => {
    const [types, setTypes] = useState<OtherDocumentType[]>([]);
    const [typesLoading, setTypesLoading] = useState(true);
    const [folderId, setFolderId] = useState<number | null>(defaultFolderId);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState<number | null>(null);
    const [typeId, setTypeId] = useState<number | null>(null);
    const [number, setNumber] = useState('');
    const [numberLoading, setNumberLoading] = useState(false);
    /** The number last filled in from the type; a number the user typed is never replaced. */
    const autoNumberRef = useRef('');
    const numberRequestRef = useRef(0);
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState('Active');
    const [reference, setReference] = useState('');
    const [comments, setComments] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const [sendToVessel, setSendToVessel] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setTypesLoading(true);
        dmsLifecycleService.apiCall<OtherDocumentType[]>('OtherDocument/GetTypes', 'get', {
            vesselId,
            vslID: vesselId,
            vesselID: vesselId
        }).then((data) => {
            if (!cancelled) setTypes(Array.isArray(data) ? data : []);
        }).catch((err) => {
            if (!cancelled) {
                setTypes([]);
                notify.error(errorMessage(err), 'Could not load document types');
            }
        }).finally(() => {
            if (!cancelled) setTypesLoading(false);
        });
        return () => { cancelled = true; };
    }, [vesselId]);

    /** Like the circular number: choosing the type fills in its next document number. */
    const chooseType = (id: number | null) => {
        setTypeId(id);
        if (!id) return;
        const requestId = ++numberRequestRef.current;
        setNumberLoading(true);
        dmsLifecycleService.getApiCall<{ documentNumber?: string } | null>(`OtherDocument/nextnumber/${id}`)
            .then((data) => {
                const next = data?.documentNumber ?? '';
                if (requestId !== numberRequestRef.current || !next) return;
                const previous = autoNumberRef.current;
                autoNumberRef.current = next;
                setNumber((current) => (current.trim() === '' || current === previous ? next : current));
            })
            .catch(() => undefined) // the number can still be typed
            .finally(() => { if (requestId === numberRequestRef.current) setNumberLoading(false); });
    };

    const writable = folders.filter((f) => f.canEdit);
    const folderOptions = [
        { label: 'Not in a folder', value: NO_FOLDER as number | null },
        ...writable.map((f) => ({ label: paths.get(f.otherDocument_FolderID) ?? f.folderName, value: f.otherDocument_FolderID as number | null })),
        { label: '+ New folder…', value: NEW_FOLDER as number | null },
    ];
    const creatingFolder = folderId === NEW_FOLDER;

    /** Adds picked files to the list (the same file twice is kept once), up to MAX_DOCUMENT_FILES. */
    const addFiles = (picked: FileList | null) => {
        const fresh = Array.from(picked ?? []).filter((f) => !files.some((p) => p.name === f.name && p.size === f.size));
        const room = MAX_DOCUMENT_FILES - files.length;
        if (fresh.length > room) {
            const left = fresh.slice(room).map((f) => f.name).join(', ');
            notify.warn(`A document can have up to ${MAX_DOCUMENT_FILES} files. Not added: ${left}.`);
        }
        if (room > 0) setFiles([...files, ...fresh.slice(0, room)]);
        if (fileInput.current) fileInput.current.value = ''; // the same file can be picked again after removing it
    };

    const save = async () => {
        if (creatingFolder && !newFolderName.trim()) { notify.warn('Enter the new folder name.'); return; }
        if (!typeId || !number.trim() || !title.trim()) { notify.warn('Choose the type and enter the document number and title.'); return; }
        if (files.length > MAX_DOCUMENT_FILES) { notify.warn(`A document can have up to ${MAX_DOCUMENT_FILES} files.`); return; }
        setBusy(true);
        try {
            let target = folderId;
            if (creatingFolder) {
                const r = await featureApi.folders.create({ parentId: newFolderParent, name: newFolderName.trim(), vesselId });
                target = r.id;
            }
            const form = new FormData();
            form.append('typeId', String(typeId));
            form.append('documentNumber', number.trim());
            form.append('title', title.trim());
            if (status.trim()) form.append('status', status.trim());
            if (reference.trim()) form.append('reference', reference.trim());
            if (comments.trim()) form.append('comments', comments.trim());
            form.append('vesselId', String(vesselId));
            form.append('sendToVessel', String(sendToVessel));
            files.forEach((f) => form.append('files', f));
            await featureApi.folders.createDocument(target, form);
            notify.success(sendToVessel ? `Document saved. It goes to ${vesselName} with the next sync.` : 'Document saved at the office.');
            onSaved(target);
        } catch (err) {
            notify.error(errorMessage(err), 'Could not save the document');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog className="vd-dialog" header={`New document – ${vesselName}`} visible onHide={onHide} style={{ width: 720, maxWidth: '96vw' }}>
            <div className="feature-form">
                <div className="field full">
                    <label id="nd-where">Where it is kept</label>
                    <SelectButton aria-labelledby="nd-where" className="vd-where" value={sendToVessel} allowEmpty={false}
                        options={[{ label: 'Office only', value: false }, { label: `Send to ${vesselName}`, value: true }]}
                        onChange={(e) => setSendToVessel(e.value === true)} />
                    <span className={`vd-note${sendToVessel ? ' is-send' : ''}`}>
                        <i className={sendToVessel ? 'pi pi-send' : 'pi pi-info-circle'} />
                        {sendToVessel
                            ? <span>Sent to <strong>{vesselName}</strong> with the next sync; the crew sees it on board.</span>
                            : <span>Saved at the office only. It is <strong>not sent</strong> to {vesselName}.</span>}
                    </span>
                </div>
                <div className="field full">
                    <label>Folder</label>
                    <Dropdown value={folderId ?? NO_FOLDER} options={folderOptions} onChange={(e) => setFolderId(e.value ? e.value : null)} filter />
                </div>
                {creatingFolder && (
                    <>
                        <div className="field">
                            <label htmlFor="nd-folder">New folder name</label>
                            <InputText id="nd-folder" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} maxLength={150} autoFocus />
                        </div>
                        <div className="field">
                            <label>Inside</label>
                            <Dropdown value={newFolderParent} showClear placeholder="Top level"
                                options={writable.filter((f) => f.vesselID === vesselId).map((f) => ({ label: paths.get(f.otherDocument_FolderID), value: f.otherDocument_FolderID }))}
                                onChange={(e) => setNewFolderParent(e.value ?? null)} />
                        </div>
                    </>
                )}
                <div className="field">
                    <label>Document type</label>
                    <Dropdown value={typeId} options={types} optionLabel="documentType" optionValue="otherDocument_TypeID" filter
                        onChange={(e) => chooseType(e.value)} placeholder={typesLoading ? 'Loading types…' : 'Choose the type'} disabled={typesLoading} />
                </div>
                <div className="field">
                    <label htmlFor="nd-no">Document number</label>
                    <InputText id="nd-no" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={50}
                        placeholder={numberLoading ? 'Getting the next number…' : 'Filled in when you choose the type'} />
                </div>
                <div className="field full">
                    <label htmlFor="nd-title">Title</label>
                    <InputText id="nd-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
                </div>
                <div className="field">
                    <label htmlFor="nd-status">Status</label>
                    <InputText id="nd-status" value={status} onChange={(e) => setStatus(e.target.value)} maxLength={50} />
                </div>
                <div className="field">
                    <label htmlFor="nd-ref">Reference</label>
                    <InputText id="nd-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={150} />
                </div>
                <div className="field full">
                    <label htmlFor="nd-com">Comments</label>
                    <InputTextarea id="nd-com" value={comments} onChange={(e) => setComments(e.target.value)} rows={2} maxLength={500} autoResize />
                </div>
                <div className="field full">
                    <label id="nd-files-label">
                        Files <span className="vd-pick__count">{files.length} of {MAX_DOCUMENT_FILES}</span>
                    </label>
                    <input ref={fileInput} id="nd-files" type="file" multiple hidden aria-labelledby="nd-files-label"
                        onChange={(e) => addFiles(e.target.files)} />
                    <div className="vd-pick">
                        {files.map((f) => (
                            <span className="vd-pick__item" key={`${f.name}-${f.size}`}>
                                <i className="pi pi-paperclip" aria-hidden="true" />
                                <span className="vd-pick__name" title={f.name}>{f.name}</span>
                                <span className="vd-pick__size">{formatSize(f.size)}</span>
                                <Button type="button" icon="pi pi-times" text rounded className="vd-pick__remove" disabled={busy}
                                    aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))} />
                            </span>
                        ))}
                        <Button type="button" icon="pi pi-upload" outlined className="vd-pick__add"
                            label={files.length === 0 ? `Add files (up to ${MAX_DOCUMENT_FILES})` : 'Add more'}
                            disabled={busy || files.length >= MAX_DOCUMENT_FILES} onClick={() => fileInput.current?.click()} />
                    </div>
                </div>
            </div>
            <div className="vd-dialog-actions">
                <Button label="Cancel" text onClick={onHide} />
                <Button label="Save document" icon="pi pi-check" loading={busy} onClick={save} />
            </div>
        </Dialog>
    );
};

/** Files a document in another folder of this vessel, or takes it out of its folder. */
const MoveDialog: React.FC<{ doc: FolderDocument; folders: FolderItem[]; paths: Map<number, string>; onHide: () => void; onSaved: () => void }> =
    ({ doc, folders, paths, onHide, onSaved }) => {
        const [folderId, setFolderId] = useState<number | null | undefined>(undefined);
        const [busy, setBusy] = useState(false);
        const currentFolder = doc.otherDocument_FolderID == null
            ? 'Not in a folder'
            : paths.get(doc.otherDocument_FolderID) ?? doc.folderName ?? 'Unknown folder';
        const destinationFolder = folderId == null
            ? 'Not in a folder'
            : paths.get(folderId) ?? 'Selected folder';
        const unchangedDestination = folderId === undefined || folderId === (doc.otherDocument_FolderID ?? null);
        const save = () => {
            if (unchangedDestination || busy) return;
            confirmDialog({
                header: 'Confirm move',
                message: (
                    <div className="vd-move-confirm-message">
                        <span className="vd-move-confirm-message__title">
                            Move {doc.documentNumber} – {doc.documentTitle}?
                        </span>
                        <span className="vd-move-confirm-message__route">
                            <span><strong>From</strong> {currentFolder}</span>
                            <i className="pi pi-arrow-right" aria-hidden="true" />
                            <span><strong>To</strong> {destinationFolder}</span>
                        </span>
                    </div>
                ),
                icon: 'pi pi-exclamation-triangle',
                acceptLabel: 'Move',
                rejectLabel: 'Cancel',
                className: 'vd-move-confirm-dialog',
                accept: async () => {
                    setBusy(true);
                    try {
                        await featureApi.folders.moveDocument(doc.otherDocumentMasterID, folderId);
                        onSaved();
                    } catch (err) {
                        notify.error(errorMessage(err));
                    } finally {
                        setBusy(false);
                    }
                },
            });
        };
        const destinationFolders = folders.filter((folder) =>
            folder.canEdit && folder.otherDocument_FolderID !== doc.otherDocument_FolderID
        );
        return (
            <Dialog className="vd-dialog" header={`Move ${doc.documentNumber}`} visible onHide={onHide} style={{ width: 480, maxWidth: '96vw' }}>
                <div className="feature-form">
                    <div className="field full">
                        <label>Current folder</label>
                        <div className="vd-move-current-folder">
                            <i className="pi pi-folder" aria-hidden="true" />
                            <span>{currentFolder}</span>
                        </div>
                    </div>
                    <div className="field full">
                        <label htmlFor="vd-move-destination">Move to</label>
                        <Dropdown inputId="vd-move-destination" value={folderId} filter showClear
                            placeholder="Choose a destination folder"
                            options={destinationFolders.map((folder) => ({
                                label: paths.get(folder.otherDocument_FolderID) ?? folder.folderName,
                                value: folder.otherDocument_FolderID,
                            }))}
                            onChange={(e) => setFolderId(e.value ?? null)} />
                    </div>
                </div>
                <div className="vd-dialog-actions">
                    <Button label="Cancel" text onClick={onHide} />
                    <Button label="Move" icon="pi pi-check" loading={busy} disabled={unchangedDestination || busy} onClick={save} />
                </div>
            </Dialog>
        );
    };

export default VesselDocuments;