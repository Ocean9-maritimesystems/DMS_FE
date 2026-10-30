import React, { useState, useEffect, useMemo, useRef } from 'react';
import { InputText } from 'primereact/inputtext';
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputSwitch } from 'primereact/inputswitch';
import { SelectButton } from 'primereact/selectbutton';
import { Checkbox } from 'primereact/checkbox';
import { Dialog } from 'primereact/dialog';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import { Vessel } from '../../VesselDetails/VesselDetails';
import { canOpenInBrowser } from '../../utils/sanitize';
import './AddEditCircular.scss';

interface AddEditCircularProps {
    initialData?: CircularFormData;
    /**
     * release: also release the circular to the vessels after saving it ("Save and release").
     * Resolves false when the save failed: the form stays open with what was typed.
     */
    onSubmit: (data: CircularFormData, options?: { release?: boolean }) => void | Promise<boolean | void>;
    onCancel: () => void;
    circularType: string;
    selectedAction: string;
    selectedCIR_MasterID: number;
}

export interface CircularFormData {
    ciR_MasterID: number;
    ciR_BlobID: number;
    circularType: string;
    ciR_CategoryID: number;
    ciR_Number: string;
    allowedUserToAck: string;
    requireAcknowledgement?: boolean;
    reference: string,
    title: string;
    status: 'Active' | 'Archived' | 'Draft';
    priority: '1' | '2' | '3';
    dateIssued: Date | null;
    releasedDate: Date | null;
    remarks?: string;
    createdBy?: string;

    description?: string;
    fileName?: string;
    fileType?: string;
    originalFileType?: string;
    /** Text in the form; sent to the API as a number. */
    blobSize?: string | number;
    blobContents?: Uint8Array | string;
    calledMode?: string;
    vesselIdList?: number[];
}

interface AllowedUserOption {
    label: string;
    value: string;
    department?: string;
}

/** api/circular/GetCIRDetails: the circular as stored (some lists come under older names too). */
interface CircularDetailsDto {
    ciR_MasterID?: number;
    ciR_BlobID?: number;
    circularType?: string;
    ciR_CategoryID?: number;
    ciR_Number?: string;
    allowedUserToAck?: string;
    allowedUserToAckList?: unknown;
    allowedUsersToAck?: unknown;
    requireAcknowledgement?: boolean;
    vesselIdList?: unknown;
    vesselIDList?: unknown;
    title?: string;
    status?: CircularFormData['status'];
    priority?: string | number;
    dateIssued?: string | null;
    releasedDate?: string | null;
    remarks?: string;
    createdBy?: string;
    description?: string;
    fileName?: string;
    fileType?: string;
    originalFileType?: string;
    blobSize?: string | number;
    blobContents?: string;
    [other: string]: unknown;
}

/** api/circular/GetNextCIRNumbersByCategory */
interface NextCircularNumberDto {
    cirNumber?: string;
    allowedUserToAck?: string;
    allowedUserToAckList?: unknown;
    allowedUsersToAck?: unknown;
}

/** api/circular/GetCategories */
interface CircularCategoryDto {
    category: string;
    ciR_CategoryID: number;
}

/** A value from the API that may be an object: its fields (empty when it is not one). */
const fieldsOf = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toAllowedUserOptions = (value: unknown): AllowedUserOption[] => {
    const values = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',').map(item => item.trim()).filter(Boolean)
            : [];

    return (values as unknown[]).map(entry => {
        if (typeof entry === 'string') {
            return { label: entry, value: entry };
        }

        const item = fieldsOf(entry);
        const optionValue = String(item.value ?? item.id ?? item.userRank ?? item.userName ?? item.name ?? '');
        return {
            label: String(item.label ?? item.userRank ?? item.userName ?? item.name ?? optionValue),
            value: optionValue
        };
    }).filter(option => option.value);
};

const toVesselRankOptions = (ranks: unknown): AllowedUserOption[] => {
    if (!Array.isArray(ranks)) return [];

    return (ranks as unknown[])
        .map((entry): AllowedUserOption | null => {
            const rank = fieldsOf(entry);
            const userRank = String(rank.userRank ?? rank.UserRank ?? '').trim();
            const department = String(rank.userDeptDisplay ?? rank.UserDeptDisplay ?? '').trim();
            return userRank
                ? { label: userRank, value: userRank, department }
                : null;
        })
        .filter((option): option is AllowedUserOption => option !== null);
};

const toAllowedUserValues = (value: unknown): string[] =>
    toAllowedUserOptions(value).map(option => option.value);

const toVesselIds = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];

    return (value as unknown[])
        .map(item => {
            if (typeof item === 'number') return item;
            const v = fieldsOf(item);
            return Number(v.vesselID ?? v.vesselId ?? v.id ?? item);
        })
        .filter(vesselId => Number.isFinite(vesselId) && vesselId > 0);
};

const getReferenceValue = (value: unknown): string => {
    const data = fieldsOf(value);
    return String(data.reference ?? data.Reference ?? data.circularReference ?? data.cirReference ?? '');
};

const decodeBlobContents = (contents: Uint8Array | string): Uint8Array | null => {
    if (contents instanceof Uint8Array) return contents;
    if (typeof contents !== 'string' || !contents.trim()) return null;

    try {
        const base64 = contents.includes(',')
            ? contents.slice(contents.indexOf(',') + 1)
            : contents;
        const byteCharacters = window.atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);

        for (let index = 0; index < byteCharacters.length; index += 1) {
            byteArray[index] = byteCharacters.charCodeAt(index);
        }

        return byteArray;
    } catch {
        return null;
    }
};

const defaultData: CircularFormData = {
    ciR_MasterID: -1,
    ciR_BlobID: -1,
    circularType: 'circulars',
    ciR_CategoryID: -1,
    ciR_Number: '',
    allowedUserToAck: '',
    requireAcknowledgement: false,
    reference: '',
    title: '',
    status: 'Draft',
    priority: '3',
    dateIssued: null,
    releasedDate: null,
    remarks: '',
    createdBy: '',
    description: '',
    fileName: '',
    fileType: '',
    originalFileType: '',
    blobSize: '',
    blobContents: undefined,
    calledMode: 'New',
    vesselIdList: []
}

/* ---------- Attachment (one file per circular: the API stores a single blob) ---------- */

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];

const fileExtension = (name: string) => (name.split('.').pop() || '').toLowerCase();
const fileContentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const fileIcon = (name: string) => {
    const ext = fileExtension(name);
    if (ext === 'pdf') return 'pi-file-pdf';
    if (ext === 'doc' || ext === 'docx') return 'pi-file-word';
    if (ext === 'xls' || ext === 'xlsx') return 'pi-file-excel';
    return 'pi-file';
};

const formatFileSize = (bytes: number) => {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/* ---------- Vessel picker (search, type filter, select all) ---------- */

interface VesselPickerProps {
    vessels: Vessel[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    disabled: boolean;
}

const VesselPicker: React.FC<VesselPickerProps> = ({ vessels, selectedIds, onChange, disabled }) => {
    const [search, setSearch] = useState('');
    const [type, setType] = useState<string>('all');

    const types = useMemo(
        () => Array.from(new Set(vessels.map(v => v.vslType).filter(Boolean))).sort(),
        [vessels]
    );

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return vessels.filter(v =>
            (type === 'all' || v.vslType === type) &&
            (!term || v.vslName?.toLowerCase().includes(term) || v.vslType?.toLowerCase().includes(term))
        );
    }, [vessels, search, type]);

    const selected = new Set(selectedIds);
    const allVisibleSelected = visible.length > 0 && visible.every(v => selected.has(v.vesselID));

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        onChange(Array.from(next));
    };

    const toggleAllVisible = () => {
        const next = new Set(selected);
        if (allVisibleSelected) visible.forEach(v => next.delete(v.vesselID));
        else visible.forEach(v => next.add(v.vesselID));
        onChange(Array.from(next));
    };

    return (
        <div className={`cir-vessels${disabled ? ' disabled' : ''}`} aria-disabled={disabled}>
            <div className="cir-vessels-search">
                <i className="pi pi-search" />
                <InputText value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vessels" aria-label="Search vessels" disabled={disabled} />
            </div>
            {types.length > 1 && (
                <div className="cir-vessels-types" role="group" aria-label="Vessel type">
                    {['all', ...types].map(t => (
                        <button
                            key={t}
                            type="button"
                            className={`cir-chip${type === t ? ' active' : ''}`}
                            onClick={() => setType(t)}
                            disabled={disabled}
                        >
                            {t === 'all' ? 'All types' : t}
                        </button>
                    ))}
                </div>
            )}
            <div className="cir-vessels-head">
                <label className="cir-check">
                    <Checkbox checked={allVisibleSelected} onChange={toggleAllVisible} disabled={disabled || visible.length === 0} />
                    <span>Select all shown</span>
                </label>
                <span className="cir-muted">
                    {selectedIds.length} of {vessels.length} selected
                    {selectedIds.length > 0 && (
                        <button type="button" className="cir-link" onClick={() => onChange([])} disabled={disabled}>Clear</button>
                    )}
                </span>
            </div>
            <ul className="cir-vessels-list">
                {visible.length === 0 && <li className="cir-vessels-empty">No vessels found</li>}
                {visible.map(v => (
                    <li key={v.vesselID}>
                        <label className={`cir-check cir-vessel-row${selected.has(v.vesselID) ? ' checked' : ''}`}>
                            <Checkbox checked={selected.has(v.vesselID)} onChange={() => toggle(v.vesselID)} disabled={disabled} />
                            <span className="cir-vessel-name">{v.vslName}</span>
                            <span className="cir-vessel-type">{v.vslType}</span>
                        </label>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const AddEditCircular: React.FC<AddEditCircularProps> = ({ initialData, onSubmit, onCancel, circularType, selectedAction, selectedCIR_MasterID }) => {
    const [formData, setFormData] = useState<CircularFormData>(initialData || defaultData);
    const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: number }[]>([]); // value: ciR_CategoryID
    const [allowedUserOptions, setAllowedUserOptions] = useState<AllowedUserOption[]>([]);
    const [selectedAllowedUsers, setSelectedAllowedUsers] = useState<string[]>(
        toAllowedUserValues(initialData?.allowedUserToAck)
    );
    const [vesselList, setVesselList] = useState<Vessel[]>([]);
    const [selectedVesselIds, setSelectedVesselIds] = useState<number[]>(
        initialData?.vesselIdList || []
    );
    const [requireAcknowledgement, setRequireAcknowledgement] = useState(
        initialData?.requireAcknowledgement ?? false
    );
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileError, setFileError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false); // a save is on its way: no second one
    // A new circular gets a temporary record when the form opens. If the form closes without saving
    // (Cancel, the X, or leaving the page) that record is removed, so no empty drafts are left behind.
    const tempMasterIdRef = useRef(-1);
    const savedRef = useRef(false);

    const priorityOptions = [
        { label: 'High', value: '1' },
        { label: 'Medium', value: '2' },
        { label: 'Low', value: '3' }
    ];

    useEffect(() => {
        const fetchData = async () => {
                dmsLifecycleService.getApiCall('Manuals/GetManualRightsUsersAsync')
                    .then(data => {
                        setVesselList(data.vesselList || []);
                        setAllowedUserOptions(toVesselRankOptions(data.vslRankList));
                    })
                    .catch(() => {
                        setVesselList([]);
                        setAllowedUserOptions([]);
                    });

                dmsLifecycleService.getApiCall<CircularCategoryDto[] | null>(`circular/GetCategories?isToIncludeAll=false&circularType=${circularType}`)
                    .then(data => {
                        const options = (data || []).map((item) => ({
                            label: item.category,
                            value: item.ciR_CategoryID,
                        }));
                        setCategoryOptions(options);
                    })
                    .catch(() => setCategoryOptions([]));

                if (selectedAction === 'Edit' && selectedCIR_MasterID > 0) {
                    dmsLifecycleService.getApiCall<CircularDetailsDto>(`circular/GetCIRDetails/${selectedCIR_MasterID}`)
                        .then((data) => {
                            const allowedUsers = data.allowedUserToAckList ?? data.allowedUsersToAck ?? data.allowedUserToAck;
                            const allowedUserValues = toAllowedUserValues(allowedUsers);
                            const vesselIds = toVesselIds(data.vesselIdList ?? data.vesselIDList);
                            const acknowledgementRequired =
                                Boolean(data.requireAcknowledgement) ||
                                allowedUserValues.length > 0 ||
                                vesselIds.length > 0;

                            setFormData({
                                ciR_MasterID: data.ciR_MasterID ?? selectedCIR_MasterID ?? -1,
                                ciR_BlobID: data.ciR_BlobID ?? -1,
                                circularType: data.circularType ?? circularType,
                                ciR_CategoryID: data.ciR_CategoryID ?? -1,
                                ciR_Number: data.ciR_Number ?? '',
                                allowedUserToAck: data.allowedUserToAck ?? '',
                                requireAcknowledgement: acknowledgementRequired,
                                reference: getReferenceValue(data),
                                title: data.title ?? '',
                                status: data.status ?? 'Draft',
                                priority: (data.priority?.toString() ?? '3') as CircularFormData['priority'],
                                dateIssued: data.dateIssued ? new Date(data.dateIssued) : null,
                                releasedDate: data.releasedDate ? new Date(data.releasedDate) : null,
                                remarks: data.remarks ?? '',
                                createdBy: data.createdBy ?? '',
                                description: data.description ?? '',
                                fileName: data.fileName ?? '',
                                fileType: data.fileType ?? '',
                                originalFileType: data.originalFileType ?? '',
                                blobSize: data.blobSize ?? '0',
                                blobContents: data.blobContents ?? '',
                                calledMode: 'Edit',
                                vesselIdList: vesselIds
                            });
                            setSelectedAllowedUsers(allowedUserValues);
                            setSelectedVesselIds(vesselIds);
                            setRequireAcknowledgement(acknowledgementRequired);
                        })
                        .catch(() => {

                        });
                }
                else if (selectedAction === 'Add') {
                    // For add mode, reset to default or initialData
                    const cir_MasterID = await dmsLifecycleService.postApiCall(`circular/AddCirMaster?circularType=${circularType}`, {});

                    setFormData({
                        ciR_MasterID: cir_MasterID,
                        ciR_BlobID: -1,
                        circularType: circularType,
                        ciR_CategoryID: -1,
                        ciR_Number: '',
                        allowedUserToAck: '',
                        requireAcknowledgement: false,
                        reference: '',
                        title: '',
                        status: 'Draft',
                        priority: "3",
                        dateIssued: null,
                        releasedDate: null,
                        remarks: '',
                        description: '',
                        fileName: '',
                        fileType: '',
                        originalFileType: '',
                        blobSize: '0',
                        blobContents: undefined,
                        calledMode: 'Add',
                        vesselIdList: []
                    });
                    setSelectedVesselIds([]);
                    setSelectedAllowedUsers([]);
                    setRequireAcknowledgement(false);
                }
        };
        fetchData();
    }, [ selectedAction, selectedCIR_MasterID, circularType]);

    
    useEffect(() => {
        tempMasterIdRef.current = selectedAction === 'Add' ? Number(formData.ciR_MasterID) : -1;
    }, [selectedAction, formData.ciR_MasterID]);

    useEffect(() => () => {
        if (!savedRef.current && tempMasterIdRef.current > 0) {
            dmsLifecycleService.deleteApiCall(`circular/RemoveTempCIR?cir_MasterID=${tempMasterIdRef.current}`, {}).catch(() => undefined);
        }
    }, []);

    /** Text boxes give event.target.value; the date picker gives event.value. */
    const handleInputChange = (e: { target?: unknown; value?: unknown }, name: keyof CircularFormData) => {
        const target = e.target as { value?: unknown } | null | undefined;
        const val = target && target.value !== undefined ? target.value : e.value;
        setFormData({ ...formData, [name]: val } as CircularFormData);
    };

    const handleCategoryChange = (e: DropdownChangeEvent) => {
        const categoryID = e.value;
        setFormData({ ...formData, ciR_CategoryID: categoryID });
        
        // Fetch circular number based on selected category
        if (categoryID && selectedAction !== 'Edit') {
            dmsLifecycleService.getApiCall<NextCircularNumberDto>(`circular/GetNextCIRNumbersByCategory?categoryID=${categoryID}&cir_MasterID=${formData.ciR_MasterID}`)
                .then((data) => {
                    setFormData(prev => ({ 
                        ...prev, 
                        ciR_Number: data.cirNumber || '',
                        allowedUserToAck: data.allowedUserToAck || ''
                    }));
                    const allowedUsers = data.allowedUserToAckList ?? data.allowedUsersToAck ?? data.allowedUserToAck;
                    setSelectedAllowedUsers(toAllowedUserValues(allowedUsers));
                })
                .catch(() => {
                    console.error('Failed to fetch circular number');
                });
        }
    };

    /** Reads the chosen file into the form (same fields as before: fileName, blobSize, fileType, blobContents). */
    const acceptFile = (file: File | undefined) => {
        if (!file) return;
        const ext = fileExtension(file.name);
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
            setFileError(`"${file.name}" is not a supported file. Use PDF, Word or Excel.`);
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            setFileError(`"${file.name}" is ${formatFileSize(file.size)}. The limit is 10 MB.`);
            return;
        }
        setFileError('');
        const reader = new FileReader();
        reader.onloadend = () => {
            const byteArray = new Uint8Array(reader.result as ArrayBuffer);
            setFormData(prev => ({
                ...prev,
                fileName: file.name,
                blobSize: file.size.toString(),
                fileType: ext,
                originalFileType: ext,
                blobContents: byteArray
            }));
        };
        reader.readAsArrayBuffer(file);
    };

    const removeFile = () => {
        setFileError('');
        setFormData(prev => ({
            ...prev,
            fileName: '',
            blobSize: '0',
            fileType: '',
            originalFileType: '',
            blobContents: undefined
        }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const getAttachmentBlob = () => {
        if (!formData.blobContents) return;
        const bytes = decodeBlobContents(formData.blobContents);
        if (!bytes) return;
        const ext = fileExtension(formData.fileName || '');
        const contentType = fileContentTypes[ext]
            || (formData.originalFileType?.includes('/') ? formData.originalFileType : undefined)
            || (formData.fileType?.includes('/') ? formData.fileType : undefined);
        return new Blob([bytes], { type: contentType });
    };

    /**
     * Opens the attached file (new upload or the one saved with the circular) in a new tab. Only PDFs, images and
     * plain text are opened; anything else (HTML, SVG...) is downloaded, because a page opened from here would run
     * as part of this site with the user's login.
     */
    const viewFile = () => {
        const blob = getAttachmentBlob();
        if (!blob || !formData.fileName) return;
        if (!canOpenInBrowser(blob.type)) {
            downloadFile();
            return;
        }
        const file = new File([blob], formData.fileName, { type: blob.type });
        const url = URL.createObjectURL(file);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const downloadFile = () => {
        const blob = getAttachmentBlob();
        if (!blob || !formData.fileName) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = formData.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        acceptFile(e.dataTransfer.files?.[0]);
    };

    /* Required fields */
    const errors = {
        category: !formData.ciR_CategoryID || Number(formData.ciR_CategoryID) <= 0,
        title: !formData.title?.trim(),
        priority: !formData.priority,
        dateIssued: !formData.dateIssued,
    };
    const missing = [
        errors.category && 'Category',
        errors.title && 'Title',
        errors.priority && 'Priority',
        errors.dateIssued && 'Date issued',
    ].filter(Boolean) as string[];
    const showError = (key: keyof typeof errors) => submitted && errors[key];

    const [confirmRelease, setConfirmRelease] = useState(false);
    const isDraft = (formData.status || 'Draft') === 'Draft';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        submitForm(false);
    };

    /** "Save and release": check the form, then ask before releasing. */
    const askRelease = () => {
        setSubmitted(true);
        if (missing.length > 0) return;
        setConfirmRelease(true);
    };

    const submitForm = async (release: boolean) => {
        if (saving) return;
        setSubmitted(true);
        if (missing.length > 0) return;

        // Send values the API can always read: text never null, numbers never empty text.
        const ext = fileExtension(formData.fileName || '');
        const dataToSubmit: CircularFormData = {
            ...formData,
            ciR_BlobID: Number(formData.ciR_BlobID ?? -1),
            ciR_CategoryID: Number(formData.ciR_CategoryID ?? -1),
            priority: formData.priority || '3',
            blobSize: Number(formData.blobSize || 0),
            reference: formData.reference ?? '',
            title: formData.title ?? '',
            remarks: formData.remarks ?? '',
            createdBy: formData.createdBy ?? '',
            description: formData.description ?? '',
            fileName: formData.fileName ?? '',
            fileType: ext || formData.fileType || '',
            originalFileType: ext || formData.originalFileType || '',
            status: formData.status || 'Draft',
        };
        dataToSubmit.allowedUserToAck = selectedAllowedUsers.join(', ');
        dataToSubmit.vesselIdList = selectedVesselIds;
        dataToSubmit.requireAcknowledgement = requireAcknowledgement;
        if (dataToSubmit.blobContents && dataToSubmit.blobContents instanceof Uint8Array) {
            let binary = '';
            const bytes = new Uint8Array(dataToSubmit.blobContents);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            dataToSubmit.blobContents = window.btoa(binary);
        }

        // Kept when the form closes: the temporary record is now the circular. A failed save (false) leaves it
        // temporary again, so Cancel still removes it.
        savedRef.current = true;
        setSaving(true);
        try {
            const ok = await onSubmit(dataToSubmit, { release });
            if (ok === false) savedRef.current = false;
        } finally {
            setSaving(false);
        }
    };

    // The temporary record is removed when the form closes (see the effect above).
    const handleCancel = () => onCancel();

    const typeLabel = /alert/i.test(circularType) ? 'alert' : 'circular';
    const fileSize = Number(formData.blobSize || 0);

    return (
        <form onSubmit={handleSubmit} className="cir-form p-fluid" noValidate>
            <div className="cir-form-body">
                <div className="cir-col">
                    <section className="cir-card">
                        <h3><i className="pi pi-file-edit" /> Details</h3>
                        <div className="cir-grid">
                            <div className="cir-field">
                                <label htmlFor="category">Category <span className="required">*</span></label>
                                <Dropdown
                                    id="category"
                                    value={formData.ciR_CategoryID}
                                    options={categoryOptions}
                                    onChange={handleCategoryChange}
                                    placeholder="Select a category"
                                    className={showError('category') ? 'p-invalid' : ''}
                                />
                                {showError('category') && <small className="cir-error">Choose a category</small>}
                            </div>
                            <div className="cir-field">
                                <label htmlFor="ciR_Number">{typeLabel === 'alert' ? 'Alert' : 'Circular'} number</label>
                                <InputText
                                    id="ciR_Number"
                                    value={formData.ciR_Number || ''}
                                    onChange={(e) => handleInputChange(e, 'ciR_Number')}
                                    placeholder="Filled in when you pick a category"
                                />
                            </div>
                            <div className="cir-field span-2">
                                <label htmlFor="title">Title <span className="required">*</span></label>
                                <InputText
                                    id="title"
                                    value={formData.title || ''}
                                    onChange={(e) => handleInputChange(e, 'title')}
                                    placeholder={`What is this ${typeLabel} about?`}
                                    className={showError('title') ? 'p-invalid' : ''}
                                />
                                {showError('title') && <small className="cir-error">Enter a title</small>}
                            </div>
                            <div className="cir-field">
                                <label id="priority-label">Priority <span className="required">*</span></label>
                                <SelectButton
                                    className={`cir-priority${showError('priority') ? ' p-invalid' : ''}`}
                                    value={formData.priority}
                                    options={priorityOptions}
                                    onChange={(e) => e.value && setFormData(prev => ({ ...prev, priority: e.value }))}
                                    aria-labelledby="priority-label"
                                    itemTemplate={(o) => <span className={`cir-priority-option p-${o.value}`}>{o.label}</span>}
                                />
                            </div>
                            <div className="cir-field">
                                <label htmlFor="dateIssued">Date issued <span className="required">*</span></label>
                                <Calendar
                                    id="dateIssued"
                                    value={formData.dateIssued ? new Date(formData.dateIssued) : null}
                                    onChange={(e) => handleInputChange(e, 'dateIssued')}
                                    showIcon
                                    dateFormat="dd M yy"
                                    placeholder="Select date"
                                    className={showError('dateIssued') ? 'p-invalid' : ''}
                                />
                                {showError('dateIssued') && <small className="cir-error">Pick the issue date</small>}
                            </div>
                            <div className="cir-field span-2">
                                <label htmlFor="reference">Reference</label>
                                <InputText
                                    id="reference"
                                    value={formData.reference || ''}
                                    onChange={(e) => handleInputChange(e, 'reference')}
                                    placeholder="e.g. HQ/OPS/45"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="cir-card">
                        <h3><i className="pi pi-comment" /> Message</h3>
                        <InputTextarea
                            id="remarks"
                            value={formData.remarks || ''}
                            onChange={(e) => handleInputChange(e, 'remarks')}
                            rows={5}
                            placeholder={`Message shown with the ${typeLabel}, or any remarks`}
                            aria-label="Message / remarks"
                            autoResize
                        />
                    </section>

                    <section className="cir-card">
                        <h3>
                            <i className="pi pi-paperclip" /> Attachment
                            <span className="cir-muted cir-h-note">PDF, Word or Excel · up to 10 MB</span>
                        </h3>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_EXTENSIONS.map(x => '.' + x).join(',')}
                            className="cir-file-input"
                            onChange={(e) => acceptFile(e.target.files?.[0])}
                            tabIndex={-1}
                            aria-hidden="true"
                        />
                        {formData.fileName ? (
                            <div className="cir-file">
                                <i className={`pi ${fileIcon(formData.fileName)} cir-file-icon`} />
                                <div className="cir-file-text">
                                    <span className="cir-file-name">{formData.fileName}</span>
                                    <span className="cir-muted">{[fileExtension(formData.fileName).toUpperCase(), formatFileSize(fileSize)].filter(Boolean).join(' · ')}</span>
                                </div>
                                <div className="cir-file-actions">
                                    {formData.blobContents && (
                                        <>
                                            <Button type="button" icon="pi pi-eye" className="p-button-text p-button-sm" onClick={viewFile} tooltip="Open" tooltipOptions={{ position: 'top' }} aria-label="Open file" />
                                            <Button type="button" icon="pi pi-download" className="p-button-text p-button-sm" onClick={downloadFile} tooltip="Download" tooltipOptions={{ position: 'top' }} aria-label="Download file" />
                                        </>
                                    )}
                                    <Button type="button" icon="pi pi-refresh" className="p-button-text p-button-sm" onClick={() => fileInputRef.current?.click()} tooltip="Replace" tooltipOptions={{ position: 'top' }} aria-label="Replace file" />
                                    <Button type="button" icon="pi pi-trash" className="p-button-text p-button-danger p-button-sm" onClick={removeFile} tooltip="Remove" tooltipOptions={{ position: 'top' }} aria-label="Remove file" />
                                </div>
                            </div>
                        ) : (
                            <div
                                className={`cir-dropzone${dragOver ? ' drag-over' : ''}${fileError ? ' has-error' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                            >
                                <i className="pi pi-cloud-upload" />
                                <span><strong>Click to choose a file</strong> or drag it here</span>
                            </div>
                        )}
                        {fileError && <small className="cir-error">{fileError}</small>}
                    </section>
                </div>

                <div className="cir-col">
                    <section className="cir-card">
                        <h3><i className="pi pi-check-square" /> Acknowledgement</h3>
                        <label className="cir-switch" htmlFor="requireAcknowledgement">
                            <InputSwitch
                                inputId="requireAcknowledgement"
                                checked={requireAcknowledgement}
                                onChange={(event) => setRequireAcknowledgement(!!event.value)}
                            />
                            <span>
                                <strong>Require acknowledgement</strong>
                                <span className="cir-muted">Vessels must confirm they have read it</span>
                            </span>
                        </label>
                        <div className="cir-field">
                            <label htmlFor="allowedUserToAck">Ranks who can acknowledge</label>
                            <MultiSelect
                                id="allowedUserToAck"
                                className="allowed-user-rank-select"
                                panelClassName="allowed-user-rank-panel"
                                disabled={!requireAcknowledgement}
                                value={selectedAllowedUsers}
                                options={allowedUserOptions}
                                onChange={(e) => setSelectedAllowedUsers(e.value || [])}
                                placeholder="Select ranks"
                                display="chip"
                                filter
                                filterPlaceholder="Search ranks..."
                                maxSelectedLabels={4}
                                selectedItemsLabel="{0} ranks selected"
                                showSelectAll
                                showClear
                                optionLabel="label"
                                optionValue="value"
                                itemTemplate={(option: AllowedUserOption) => (
                                    <div className="allowed-user-rank-option">
                                        <span className="rank-option-name">{option.label}</span>
                                        {option.department && (
                                            <span className="rank-option-department">{option.department}</span>
                                        )}
                                    </div>
                                )}
                                emptyMessage="No vessel ranks available"
                                emptyFilterMessage="No matching vessel ranks"
                            />
                        </div>
                    </section>

                    <section className="cir-card cir-card-vessels">
                        <h3><i className="pi pi-send" /> Vessels</h3>
                        <VesselPicker
                            vessels={vesselList}
                            selectedIds={selectedVesselIds}
                            onChange={setSelectedVesselIds}
                            disabled={!requireAcknowledgement}
                        />
                    </section>
                </div>
            </div>

            <div className="cir-form-footer">
                <span className={submitted && missing.length ? 'cir-error' : 'cir-muted'}>
                    {submitted && missing.length
                        ? `Fill in: ${missing.join(', ')}`
                        : <>Fields marked <span className="required">*</span> are required</>}
                </span>
                <div className="cir-form-buttons">
                    <Button type="button" label="Cancel" onClick={handleCancel} className="p-button-text" />
                    <Button type="submit" label={isDraft ? 'Save as draft' : `Save ${typeLabel}`} icon="pi pi-check"
                        className={isDraft ? 'p-button-outlined' : undefined} loading={saving} disabled={saving} />
                    {isDraft && (
                        <Button type="button" label="Save and release" icon="pi pi-send" onClick={askRelease} disabled={saving}
                            title={`Save, then send the ${typeLabel} to the vessels`} />
                    )}
                </div>
            </div>

            {confirmRelease && (
                <Dialog header={`Release this ${typeLabel}?`} visible onHide={() => setConfirmRelease(false)} className="feature-dialog"
                    style={{ width: '520px', maxWidth: '96vw' }} draggable={false}
                    footer={(
                        <div className="feature-dialog-footer">
                            <Button type="button" label="Back" text onClick={() => setConfirmRelease(false)} />
                            <Button type="button" label="Save and release" icon="pi pi-send"
                                onClick={() => { setConfirmRelease(false); submitForm(true); }} />
                        </div>
                    )}>
                    <div className="release-note">
                        <p>The {typeLabel} is saved, then released:</p>
                        <ul>
                            <li>its status becomes <strong>Active</strong> and today becomes its released date;</li>
                            <li>the selected vessels get it with the next sync and see it in their inbox;</li>
                            <li>the crew must acknowledge it within the set number of days;</li>
                            <li>manuals it amends show it as an open amendment.</li>
                        </ul>
                        <p className="release-warn"><i className="pi pi-info-circle" aria-hidden="true" /> It can no longer go back to draft; after this it can only be cancelled or superseded.</p>
                    </div>
                </Dialog>
            )}
        </form>
    );
};
export default AddEditCircular;
