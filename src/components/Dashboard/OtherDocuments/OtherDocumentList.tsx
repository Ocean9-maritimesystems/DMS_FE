import React, { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Skeleton } from 'primereact/skeleton';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import dmsLifecycleService, { errorMessage, getFile } from '../../../services/DMSLifecycleService';
import notify from '../../../services/notify';
import { openOrSaveBlob, saveBlob } from '../../utils/files';
import AddEditOtherDocument, { OtherDocumentTypeOption } from '../../OtherDocument/AddEditOtherDocument';
import './OtherDocumentList.scss';

interface OtherDocument {
    documentID: number;
    title: string;
    documentType: string;
    uploadBy: string;
    uploadDate: string;
    vesselID?: number;
}

/** GET api/OtherDocument/Documents/{id}/Files */
interface DocumentFile {
    id: number;
    fileName: string;
    fileType?: string | null;
    blobSize: number;
}

interface OtherDocumentListProps {
    vesselId: number;
    vesselName: string;
}

const OtherDocumentList: React.FC<OtherDocumentListProps> = ({ vesselId, vesselName }) => {
    const [documents, setDocuments] = useState<OtherDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [globalFilterValue, setGlobalFilterValue] = useState('');
    const [selectedType, setSelectedType] = useState<string>('');
    const [documentTypes, setDocumentTypes] = useState<OtherDocumentTypeOption[]>([
        { label: 'All Types', value: '' }
    ]);
    const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);
    useEffect(() => {
        const fetchDocumentTypes = async () => {
            try {
                // The API has sent these lists in both camelCase and PascalCase.
                type TypeRow = { documentType?: string; DocumentType?: string; otherDocument_TypeID?: number; OtherDocument_TypeID?: number };
                const types = await dmsLifecycleService.apiCall<TypeRow[] | null>('OtherDocument/GetTypes', 'get', {
                    vesselId: vesselId ?? 0,
                    vslID: vesselId ?? 0,
                    vesselID: vesselId ?? 0
                });
                const mappedTypes = (Array.isArray(types) ? types : []).map((item) => ({
                    label: item.documentType || item.DocumentType || 'Unknown',
                    value: item.documentType || item.DocumentType || '',
                    docTypeId: Number(item.otherDocument_TypeID ?? item.OtherDocument_TypeID ?? 0)
                }));

                setDocumentTypes([{ label: 'All Types', value: '' }, ...mappedTypes]);
            } catch {
                setDocumentTypes([{ label: 'All Types', value: '' }]);
            }
        };

        fetchDocumentTypes();
    }, [vesselId]);

    useEffect(() => {
        const fetchDocuments = async () => {
            setLoading(true);

            try {
                type DocumentRow = {
                    otherDocumentMasterID?: number; OtherDocumentMasterID?: number;
                    documentTitle?: string; DocumentTitle?: string;
                    documentType?: string; DocumentType?: string;
                    uploadedBy?: string; UploadedBy?: string;
                    uploadedOn?: string; UploadedOn?: string;
                    vesselID?: number; VesselID?: number; vslID?: number; VslID?: number;
                };
                const response = await dmsLifecycleService.apiCall<DocumentRow[] | { data?: DocumentRow[] } | null>('OtherDocument/GetDocuments', 'get', {
                    vesselId: vesselId ?? 0,
                    documentType: selectedType || undefined
                });

                const rows: DocumentRow[] = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];

                const mappedRows = rows.map((item) => ({
                    documentID: item.otherDocumentMasterID ?? item.OtherDocumentMasterID ?? 0,
                    title: item.documentTitle ?? item.DocumentTitle ?? 'Untitled document',
                    documentType: item.documentType ?? item.DocumentType ?? 'Unknown',
                    uploadBy: item.uploadedBy ?? item.UploadedBy ?? 'Unknown',
                    uploadDate: item.uploadedOn ?? item.UploadedOn ?? new Date().toISOString(),
                    vesselID: item.vesselID ?? item.VesselID ?? item.vslID ?? item.VslID ?? vesselId ?? 0
                }));

                setDocuments(mappedRows);
            } catch {
                setDocuments([]);
            } finally {
                setLoading(false);
            }
        };

        fetchDocuments();
    }, [vesselId, selectedType, reloadKey]);

    const [busyId, setBusyId] = useState<number | null>(null);

    /** The document's files, or null (with a message) when it has none. */
    const loadFiles = async (doc: OtherDocument): Promise<DocumentFile[] | null> => {
        const files = await dmsLifecycleService.getApiCall<DocumentFile[]>(`OtherDocument/Documents/${doc.documentID}/Files`);
        if (!files || files.length === 0) {
            notify.info(`"${doc.title}" has no files.`);
            return null;
        }
        return files;
    };

    const fetchFile = async (file: DocumentFile) => {
        const { blob, fileName } = await getFile(`OtherDocument/Files/${file.id}`);
        return { blob, name: fileName || file.fileName || `file-${file.id}` };
    };

    /** Opens the first file (PDFs and images in a new tab; other types are downloaded). */
    const handleViewDocument = async (doc: OtherDocument) => {
        setBusyId(doc.documentID);
        try {
            const files = await loadFiles(doc);
            if (!files) return;
            const { blob, name } = await fetchFile(files[0]);
            openOrSaveBlob(blob, name);
        } catch (err) {
            notify.error(errorMessage(err, 'The file is not available.'), 'Could not open the document');
        } finally {
            setBusyId(null);
        }
    };

    /** Downloads every file of the document. */
    const handleDownloadDocument = async (doc: OtherDocument) => {
        setBusyId(doc.documentID);
        try {
            const files = await loadFiles(doc);
            if (!files) return;
            for (const file of files) {
                const { blob, name } = await fetchFile(file);
                saveBlob(blob, name);
            }
        } catch (err) {
            notify.error(errorMessage(err, 'The file is not available.'), 'Could not download the document');
        } finally {
            setBusyId(null);
        }
    };

    /** Deletes a document added at the office (the API refuses documents that came from a vessel). */
    const handleDeleteDocument = (doc: OtherDocument) => {
        confirmDialog({
            header: 'Delete document',
            message: `Delete "${doc.title}"? This cannot be undone.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Delete',
            rejectLabel: 'Cancel',
            acceptClassName: 'p-button-danger',
            accept: async () => {
                try {
                    await dmsLifecycleService.deleteApiCall(`OtherDocument/Documents/${doc.documentID}`);
                    notify.success(`"${doc.title}" was deleted.`);
                    setReloadKey((k) => k + 1);
                } catch (err) {
                    notify.error(errorMessage(err), 'Could not delete the document');
                }
            },
        });
    };

    const handleNewDocument = () => {
        setShowNewDocumentDialog(true);
    };

    const dateTemplate = (rowData: OtherDocument) => {
        return new Date(rowData.uploadDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const actionBodyTemplate = (rowData: OtherDocument) => {
        return (
            <div className="action-buttons">
                <Button 
                    icon="pi pi-eye" 
                    className="p-button-rounded p-button-text p-button-info" 
                    tooltip="View Document"
                    tooltipOptions={{ position: 'top' }}
                    onClick={() => handleViewDocument(rowData)}
                    disabled={busyId === rowData.documentID}
                    aria-label={`View ${rowData.title}`}
                    style={{ width: '3rem', height: '3rem', fontSize: '1.5rem' }}
                />
                <Button 
                    icon="pi pi-download" 
                    className="p-button-rounded p-button-text p-button-success" 
                    tooltip="Download"
                    tooltipOptions={{ position: 'top' }}
                    onClick={() => handleDownloadDocument(rowData)}
                    disabled={busyId === rowData.documentID}
                    aria-label={`Download ${rowData.title}`}
                    style={{ width: '3rem', height: '3rem', fontSize: '1.5rem' }}
                />
                <Button 
                    icon="pi pi-trash" 
                    className="p-button-rounded p-button-text p-button-danger" 
                    tooltip="Delete"
                    tooltipOptions={{ position: 'top' }}
                    onClick={() => handleDeleteDocument(rowData)}
                    disabled={busyId === rowData.documentID}
                    aria-label={`Delete ${rowData.title}`}
                    style={{ width: '3rem', height: '3rem', fontSize: '1.5rem' }}
                />
            </div>
        );
    };

    const filteredDocuments = documents.filter(doc => {
        const matchesType = selectedType === '' || selectedType === null || selectedType === undefined || doc.documentType === selectedType;
        const matchesSearch = !globalFilterValue || 
            doc.title.toLowerCase().includes(globalFilterValue.toLowerCase()) ||
            doc.documentType.toLowerCase().includes(globalFilterValue.toLowerCase()) ||
            doc.uploadBy.toLowerCase().includes(globalFilterValue.toLowerCase());
        return matchesType && matchesSearch;
    });

    if (loading) {
        return <Skeleton width="100%" height="500px" />;
    }

    return (
        <div className="document-list-container">
            <ConfirmDialog />
            <div className="document-list-header">
                <div className="header-title">
                    <h2><i className="pi pi-file-o"></i> {vesselName} Documents</h2>
                    <span className="document-count">{filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}</span>
                </div>
                <Button 
                    label="New Document" 
                    icon="pi pi-plus" 
                    className="p-button-success" 
                    onClick={handleNewDocument}
                />
            </div>

            <div className="document-controls">
                <div className="search-box">
                    <span className="p-input-icon-left">
                        <i className="pi pi-search" />
                        <InputText
                            value={globalFilterValue}
                            onChange={(e) => setGlobalFilterValue(e.target.value)}
                            placeholder={`Search Document...`}
                            className="search-input"
                            style={{ width: '370px' }}
                        />
                    </span>
                </div>
                <label style={{ fontWeight: 'bold' }}>Type: </label>
                <Dropdown
                    value={selectedType}
                    options={documentTypes}
                    onChange={(e) => setSelectedType(e.value)}
                    placeholder="Filter by Type"
                    className="type-filter"
                    style={{ width: '370px' }}
                />
            </div>

            <div className="table-wrapper">
                <DataTable 
                    value={filteredDocuments} 
                    emptyMessage="No documents found."
                    paginator
                    rows={10}
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    className="documents-table"
                    stripedRows
                    scrollable
                    scrollHeight="flex"
                >
                    <Column field="documentType" header="Type" sortable style={{ width: '270px' }} />
                    <Column field="uploadDate" header="Upload Date" body={dateTemplate} sortable style={{ width: '140px' }} />
                    <Column field="uploadBy" header="Uploaded By" sortable style={{ width: '140px' }} />
                    <Column field="title" header="Document Title" sortable style={{ minWidth: '230px' }} />
                    <Column body={actionBodyTemplate} header="Actions" style={{ width: '120px' }} />
                </DataTable>
            </div>

            <AddEditOtherDocument
                visible={showNewDocumentDialog}
                vesselId={vesselId}
                vesselName={vesselName}
                documentTypes={documentTypes}
                onHide={() => setShowNewDocumentDialog(false)}
                onSaved={() => {
                    setShowNewDocumentDialog(false);
                    setReloadKey(previousKey => previousKey + 1);
                }}
            />
        </div>
    );
};

export default OtherDocumentList;
