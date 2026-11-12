import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import notify from '../../services/notify';
import './AddEditOtherDocument.scss';

export interface OtherDocumentTypeOption {
    label: string;
    value: string;
    docTypeId?: number;
}

interface AddEditOtherDocumentProps {
    visible: boolean;
    vesselId: number;
    /** Shown in the dialog title, e.g. "MV Ocean Star". */
    vesselName?: string;
    documentTypes: OtherDocumentTypeOption[];
    onHide: () => void;
    onSaved: () => void;
}

interface NewDocumentForm {
    title: string;
    documentNumber: string;
    documentTypeId: string;
    reference: string;
    comments: string;
    status: string;
    file: File | null;
}

const STATUS_OPTIONS = [
    { label: 'Active', value: 'Active' },
    { label: 'Review', value: 'Review' },
    { label: 'Archived', value: 'Archived' }
];

/** What the form gives to make the api/OtherDocument/AddOtherDocument body (missing values get defaults). */
interface DocumentPayloadInput {
    vesselID?: number;
    vslID?: number;
    otherDocument_TypeID?: number;
    documentNumber?: string;
    title: string;
    documentTitle?: string;
    status?: string;
    reference?: string;
    comments?: string;
    uploadedOn?: string;
    uploadedBy?: string;
    description?: string;
    fileName?: string;
    fileType?: string;
    originalFileType?: string;
    blobSize?: number;
    blobContents?: string | null;
}

const createDocumentPayload = (data: DocumentPayloadInput) => ({
    otherDocumentMasterID: 0,
    vesselID: data.vesselID ?? data.vslID ?? 0,
    vslID: data.vslID ?? data.vesselID ?? 0,
    otherDocument_TypeID: Number(data.otherDocument_TypeID ?? 0),
    documentNumber: data.documentNumber || `DOC-${Date.now()}`,
    title: data.title,
    documentTitle: data.documentTitle || data.title,
    status: data.status || 'Active',
    reference: data.reference || '',
    comments: data.comments || '',
    uploadedOn: data.uploadedOn || new Date().toISOString(),
    uploadedBy: data.uploadedBy || 'HQ',
    description: data.description || data.comments || data.title,
    fileName: data.fileName || '',
    fileType: data.fileType || 'application/octet-stream',
    originalFileType: data.originalFileType || data.fileType || 'application/octet-stream',
    blobSize: Number(data.blobSize || 0),
    blobContents: data.blobContents || null,
    calledMode: 'New'
});

const emptyForm = (documentTypes: OtherDocumentTypeOption[]): NewDocumentForm => ({
    title: '',
    documentNumber: '',
    documentTypeId: documentTypes.find(type => type.docTypeId)?.docTypeId?.toString() || '',
    reference: '',
    comments: '',
    status: 'Active',
    file: null
});

const fileIcon = (name: string) => {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'pi-file-pdf';
    if (ext === 'doc' || ext === 'docx') return 'pi-file-word';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'pi-file-excel';
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff'].includes(ext)) return 'pi-image';
    return 'pi-file';
};

const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AddEditOtherDocument: React.FC<AddEditOtherDocumentProps> = ({
    visible,
    vesselId,
    vesselName,
    documentTypes,
    onHide,
    onSaved
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [numberLoading, setNumberLoading] = useState(false);
    const [newDocumentForm, setNewDocumentForm] = useState<NewDocumentForm>(() => emptyForm(documentTypes));
    const nextNumberRequestRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const typeOptions = documentTypes
        .filter(type => type.value && type.docTypeId)
        .map(type => ({ label: type.label, value: String(type.docTypeId) }));

    useEffect(() => {
        if (visible) {
            const form = emptyForm(documentTypes);
            setNewDocumentForm(form);
            setSubmitted(false);
            // The first type is preselected, so fetch its next document number straight away.
            if (form.documentTypeId) {
                loadNextNumber(form.documentTypeId);
            }
        }
    }, [visible, documentTypes]);

    const loadNextNumber = async (documentTypeId: string) => {
        const requestId = ++nextNumberRequestRef.current;
        setNumberLoading(true);
        try {
            const response = await dmsLifecycleService.apiCall(`OtherDocument/nextnumber/${documentTypeId}`, 'get');
            const documentNumber = response?.documentNumber ?? response?.DocumentNumber ?? '';
            if (requestId === nextNumberRequestRef.current) {
                setNewDocumentForm(previous => ({ ...previous, documentNumber }));
            }
        } catch {
            if (requestId === nextNumberRequestRef.current) {
                setNewDocumentForm(previous => ({ ...previous, documentNumber: '' }));
            }
        } finally {
            if (requestId === nextNumberRequestRef.current) setNumberLoading(false);
        }
    };

    const handleDocumentTypeChange = (documentTypeId: string) => {
        setNewDocumentForm(previous => ({ ...previous, documentTypeId, documentNumber: '' }));
        if (documentTypeId) loadNextNumber(documentTypeId);
    };

    const setFile = (file: File | null) => setNewDocumentForm(prev => ({ ...prev, file }));

    const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFile(e.target.files?.[0] || null);
        e.target.value = ''; // allow choosing the same file again after removing it
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (isSubmitting) return;
        const file = e.dataTransfer.files?.[0];
        if (file) setFile(file);
    };

    const handleHide = () => {
        if (isSubmitting) return;
        onHide();
    };

    const errors = {
        title: !newDocumentForm.title.trim(),
        documentTypeId: !newDocumentForm.documentTypeId
    };
    const missing = [errors.documentTypeId && 'Document type', errors.title && 'Title'].filter(Boolean) as string[];
    const showError = (key: keyof typeof errors) => submitted && errors[key];

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setSubmitted(true);
        if (missing.length > 0 || isSubmitting) return;

        setIsSubmitting(true);
        try {
            let blobContents: string | null = null;
            if (newDocumentForm.file) {
                const fileReader = new FileReader();
                blobContents = await new Promise<string>((resolve, reject) => {
                    // readAsDataURL gives "data:<type>;base64,<data>"; the API (byte[]) needs only the base64 part.
                    fileReader.onload = () => {
                        const dataUrl = String(fileReader.result || '');
                        resolve(dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl);
                    };
                    fileReader.onerror = () => reject(new Error('Unable to read the file'));
                    fileReader.readAsDataURL(newDocumentForm.file as File);
                });
            }

            const payload = createDocumentPayload({
                vesselID: vesselId ?? 0,
                vslID: vesselId ?? 0,
                otherDocument_TypeID: Number(newDocumentForm.documentTypeId),
                documentNumber: newDocumentForm.documentNumber || `DOC-${Date.now()}`,
                title: newDocumentForm.title.trim(),
                documentTitle: newDocumentForm.title.trim(),
                status: newDocumentForm.status,
                reference: newDocumentForm.reference,
                comments: newDocumentForm.comments,
                uploadedOn: new Date().toISOString(),
                uploadedBy: 'HQ',
                description: newDocumentForm.comments || newDocumentForm.title,
                fileName: newDocumentForm.file?.name || '',
                fileType: newDocumentForm.file?.type || 'application/octet-stream',
                originalFileType: newDocumentForm.file?.type || 'application/octet-stream',
                blobSize: newDocumentForm.file?.size || 0,
                blobContents
            });

            await dmsLifecycleService.postApiCall('OtherDocument/AddOtherDocument', payload);
            notify.success(`"${newDocumentForm.title.trim()}" added.`);
            setNewDocumentForm(emptyForm(documentTypes));
            onHide();
            onSaved();
        } catch (err) {
            // Before, a failed save closed nothing and showed nothing.
            notify.error(errorMessage(err), 'Could not save the document');
        } finally {
            setIsSubmitting(false);
        }
    };

    const file = newDocumentForm.file;

    return (
        <Dialog
            visible={visible}
            onHide={handleHide}
            header={
                <div className="dialog-header-content">
                    <i className="pi pi-file-plus" />
                    <span>Add vessel document</span>
                    {vesselName && <span className="vd-header-vessel"><i className="pi pi-flag" />{vesselName}</span>}
                </div>
            }
            style={{ width: 'min(1080px, 96vw)', height: 'min(760px, 94vh)' }}
            className="vd-editor-dialog"
            closeOnEscape={!isSubmitting}
            modal
            draggable={false}
        >
            <form className="vd-form p-fluid" onSubmit={handleSubmit} noValidate>
                <div className="vd-form-body">
                    <section className="vd-card">
                        <h3><i className="pi pi-file-edit" /> Details</h3>
                        <div className="vd-grid">
                            <div className="vd-field span-2">
                                <label htmlFor="vd-title">Title <span className="required">*</span></label>
                                <InputText
                                    id="vd-title"
                                    value={newDocumentForm.title}
                                    onChange={(e) => setNewDocumentForm(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g. Safety Management Certificate"
                                    className={showError('title') ? 'p-invalid' : ''}
                                    autoFocus
                                />
                                {showError('title') && <small className="vd-error">Enter a title</small>}
                            </div>

                            <div className="vd-field span-2">
                                <label htmlFor="vd-type">Document type <span className="required">*</span></label>
                                <Dropdown
                                    inputId="vd-type"
                                    value={newDocumentForm.documentTypeId}
                                    options={typeOptions}
                                    onChange={(e) => handleDocumentTypeChange(e.value)}
                                    placeholder="Select type"
                                    optionLabel="label"
                                    optionValue="value"
                                    filter={typeOptions.length > 8}
                                    className={showError('documentTypeId') ? 'p-invalid' : ''}
                                />
                                {showError('documentTypeId') && <small className="vd-error">Choose a document type</small>}
                            </div>

                            <div className="vd-field">
                                <label htmlFor="vd-number">Document number</label>
                                <div className="vd-readonly">
                                    <InputText
                                        id="vd-number"
                                        value={newDocumentForm.documentNumber}
                                        readOnly
                                        placeholder={newDocumentForm.documentTypeId ? 'Not available' : 'Set by the document type'}
                                    />
                                    {numberLoading && <i className="pi pi-spin pi-spinner" aria-label="Loading number" />}
                                </div>
                                <small className="vd-muted">Generated automatically</small>
                            </div>

                            <div className="vd-field">
                                <span className="vd-label" id="vd-status-label">Status</span>
                                <SelectButton
                                    className="vd-status"
                                    value={newDocumentForm.status}
                                    options={STATUS_OPTIONS}
                                    onChange={(e) => e.value && setNewDocumentForm(prev => ({ ...prev, status: e.value }))}
                                    aria-labelledby="vd-status-label"
                                />
                            </div>

                            <div className="vd-field span-2">
                                <label htmlFor="vd-reference">Reference</label>
                                <InputText
                                    id="vd-reference"
                                    value={newDocumentForm.reference}
                                    onChange={(e) => setNewDocumentForm(prev => ({ ...prev, reference: e.target.value }))}
                                    placeholder="Optional, e.g. memo number"
                                />
                            </div>

                            <div className="vd-field span-2">
                                <label htmlFor="vd-comments">Comments</label>
                                <InputTextarea
                                    id="vd-comments"
                                    value={newDocumentForm.comments}
                                    onChange={(e) => setNewDocumentForm(prev => ({ ...prev, comments: e.target.value }))}
                                    rows={4}
                                    autoResize
                                    placeholder="Notes for this document (optional)"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="vd-card">
                        <h3><i className="pi pi-paperclip" /> File <span className="vd-muted vd-h-note">optional · one file</span></h3>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="vd-file-input"
                            onChange={onFileChosen}
                            tabIndex={-1}
                            aria-hidden="true"
                        />
                        {file ? (
                            <div className="vd-file">
                                <i className={`pi ${fileIcon(file.name)} vd-file-icon`} />
                                <div className="vd-file-text">
                                    <span className="vd-file-name">{file.name}</span>
                                    <span className="vd-muted">{formatFileSize(file.size)}</span>
                                </div>
                                <div className="vd-file-actions">
                                    <Button type="button" icon="pi pi-refresh" className="p-button-text p-button-sm" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting} tooltip="Replace" tooltipOptions={{ position: 'top' }} aria-label="Replace file" />
                                    <Button type="button" icon="pi pi-trash" className="p-button-text p-button-danger p-button-sm" onClick={() => setFile(null)} disabled={isSubmitting} tooltip="Remove" tooltipOptions={{ position: 'top' }} aria-label="Remove file" />
                                </div>
                            </div>
                        ) : (
                            <div
                                className={`vd-dropzone${dragOver ? ' drag-over' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                            >
                                <i className="pi pi-cloud-upload" />
                                <span><strong>Choose a file</strong> or drag it here</span>
                                <span className="vd-muted">Certificates, reports, scans or any other file</span>
                            </div>
                        )}
                    </section>
                </div>

                <div className="vd-form-footer">
                    <span className={`vd-footer-note${submitted && missing.length ? ' is-error' : ''}`}>
                        {submitted && missing.length
                            ? `Fill in: ${missing.join(', ')}`
                            : <><span className="required">*</span> Required</>}
                    </span>
                    <div className="vd-form-buttons">
                        <Button type="button" label="Cancel" className="p-button-text" onClick={handleHide} disabled={isSubmitting} />
                        <Button
                            type="submit"
                            label={isSubmitting ? 'Saving…' : 'Save document'}
                            icon={isSubmitting ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                            disabled={isSubmitting}
                        />
                    </div>
                </div>
            </form>
        </Dialog>
    );
};

export default AddEditOtherDocument;
