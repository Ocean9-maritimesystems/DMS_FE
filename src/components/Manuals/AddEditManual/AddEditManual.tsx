import React, { useState, useEffect, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { ContextMenu } from 'primereact/contextmenu';
import { getDocument } from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { Checkbox } from 'primereact/checkbox';
import JoditEditor from 'jodit-react';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import ApprovalFlow from './ApprovalFlow';
import { escapeHtml, sanitizeHtml } from '../../utils/sanitize';
import './AddEditManual.scss';

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/** api/Manuals/GetManualDetailsByVersionId */
interface ManualDetailsDto {
    dM_ManualID?: number;
    dM_ManualVersionID?: number;
    statusString?: string;
    dM_CategoryID?: string;
    manualCode?: string;
    manualName?: string;
    textContents?: string;
    isMainTitle?: number;
    isAcknowledgementRequired?: number;
    canExport?: number;
    isApprovalRequired?: number;
    approval_FlowID?: number;
    comments?: string;
    createdBy?: string;
}

type ManualFormProps = {
    initialData?: ManualFormData;
    onSubmit: (data: ManualFormData) => void;
    closeForm: () => void;
    selectedAction: string;
    selectedManualID: number;
    selectedManualVersionID: number;
};

export type ManualFormData = {
    DM_ManualID: number;
    DM_ManualVersionID: number;
    StatusString: string;
    DM_CategoryID: string;
    ManualCode: string;
    ManualName: string;
    TextContents: string;
    IsMainTitle: number;
    IsAcknowledgementRequired: number,
    CanExport: number;
    IsApprovalRequired: number;
    Approval_FlowID: number
    Comments: string;
    CreatedBy: string;
    IsToPublish: boolean;
    CalledManualID: number;
    CalledMode: string;
};

const defaultData: ManualFormData = {
    DM_ManualID: -1,
    DM_ManualVersionID: -1,
    StatusString: '',
    DM_CategoryID: '',
    ManualCode: '',
    ManualName: '',
    TextContents: '',
    IsMainTitle: 0,
    IsAcknowledgementRequired: 0,
    CanExport: 0,
    IsApprovalRequired: 0,
    Approval_FlowID: -1,
    Comments: '',
    CreatedBy: '',
    IsToPublish: false,
    CalledManualID: -1,
    CalledMode: '',
};

const AddEditManual: React.FC<ManualFormProps> = ({ initialData, onSubmit, closeForm, selectedAction, selectedManualID, selectedManualVersionID }) => {
    const [form, setForm] = useState<ManualFormData>(initialData || defaultData);
    const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
    const [approvalFlowOptions, setApprovalFlowOptions] = useState<{ label: string; value: number }[]>([]);
    const menu = useRef<ContextMenu>(null);

    const config = {
        readonly: false,
        height: 'clamp(280px, 48vh, 420px)',
        toolbar: true,
        placeholder: '',
        toolbarAdaptive: false,
        toolbarSticky: false,
        toolbarStickyOffset: 0,
        removeButtons: ['source', 'about', 'print', 'superscript', 'subscript', 'speechRecognize'],
        showXPathInStatusbar: false,
        showCharsCounter: false,
        showWordsCounter: false,
        style: {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: '"Segoe UI", Arial, sans-serif',
            fontSize: '14px',
            lineHeight: '1.6'
        }
    };

    const contextMenuItems = [
        { label: 'PDF', icon: 'pi pi-file-pdf', disabled: true },
        { label: 'Word', icon: 'pi pi-file-word', disabled: true }
    ];

    useEffect(() => {
        dmsLifecycleService.getApiCall<{ categoryName: string; dM_CategoryID: string }[] | null>('Manuals/GetManualCategory')
            .then(data => {
                const options = (data || []).map((cat) => ({
                    label: cat.categoryName,
                    value: cat.dM_CategoryID
                }));
                setCategoryOptions(options);
            })
            .catch(() => setCategoryOptions([]));

        dmsLifecycleService.getApiCall<{ flowDesc: string; flowID: number }[] | null>('Manuals/GetApprovalFlowList')
            .then(data => {
                const options = (data || []).map((flow) => ({
                    label: flow.flowDesc,
                    value: flow.flowID
                }));
                setApprovalFlowOptions(options);
            })
            .catch(() => setApprovalFlowOptions([]));


        if (selectedAction === 'Edit' && selectedManualID > 0) {
            dmsLifecycleService.getApiCall<ManualDetailsDto>(`Manuals/GetManualDetailsByVersionId/${selectedManualVersionID}`)
                .then((data) => {
                    setForm({
                        DM_ManualID: data.dM_ManualID ?? selectedManualID ?? -1,
                        DM_ManualVersionID: data.dM_ManualVersionID ?? -1,
                        StatusString: data.statusString ?? 'Draft',
                        DM_CategoryID: data.dM_CategoryID ?? '',
                        ManualCode: data.manualCode ?? '',
                        ManualName: data.manualName ?? '',
                        TextContents: sanitizeHtml(data.textContents),
                        IsMainTitle: data.isMainTitle ?? 0,
                        IsAcknowledgementRequired: data.isAcknowledgementRequired ?? 0,
                        CanExport: data.canExport ?? 0,
                        IsApprovalRequired: data.isApprovalRequired ?? 0,
                        Approval_FlowID: data.approval_FlowID ?? -1,
                        Comments: data.comments ?? '',
                        CreatedBy: data.createdBy ?? '',
                        IsToPublish: false,
                        CalledManualID: selectedManualID,
                        CalledMode: selectedAction,
                    });
                })
                .catch(() => {
                   
                });
        }
        else {
            // For add mode, reset to default or initialData
            setForm({
                DM_ManualID: -1,
                DM_ManualVersionID: -1,
                StatusString: 'NEW',
                DM_CategoryID: '',
                ManualCode: '',
                ManualName: '',
                TextContents: '',
                IsMainTitle: 0,
                IsAcknowledgementRequired: 0,
                CanExport: 0,
                IsApprovalRequired: 0,
                Approval_FlowID: -1,
                Comments: '',
                CreatedBy: '',
                IsToPublish: false,
                CalledManualID: selectedManualID,
                CalledMode: selectedAction,
            });
        }
    }, [selectedAction, selectedManualID, selectedManualVersionID]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(form);
    };

    const handlePublish = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onSubmit({ ...form, IsToPublish: true });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) {
            return;
        }
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = async () => {
                if (reader.result && typeof reader.result !== 'string') {
                const typedArray = new Uint8Array(reader.result as ArrayBuffer);
                const pdf = await getDocument({ data: typedArray }).promise;
                const page = await pdf.getPage(1);
                const content = await page.getTextContent();
                const text = content.items
                    .map((item) => ('str' in item ? item.str : ''))
                    .join(' ');
                // Text from the PDF goes into the editor as text, not as HTML.
                setForm(prev => ({ ...prev, TextContents: `<p>${escapeHtml(text ?? '')}</p>` }))
                }
            };
            reader.readAsArrayBuffer(file);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="add-edit-manual-form">
            <div className="manual-form-toolbar" style={{ marginBottom: '1px', width: '100%', flexDirection: 'row', display: 'flex', justifyContent: 'space-between' }}>
                <div className="manual-form-status" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <label style={{ fontWeight: 'bold', width: '75px' }}>Status : </label>
                    <label className='selectedTextHighlight' style={{width: '350px'}}> {form.StatusString}</label>
                </div>
                <div className="manual-form-actions d-flex justify-content-end" style={{ textAlign: 'right', width: '100%' }}>
                    <button type="button" className="button" onClick={handlePublish}>Publish</button> &nbsp;&nbsp;
                    <button type="submit" className="button">Save</button>
                    <button type="button" className="button btn-secondary ms-2" onClick={closeForm}>
                        Cancel
                    </button>
                </div>
            </div>
            <div className="manual-form-body" style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                <div className="manual-form-main" style={{ flex: 1, minWidth: '650px', textAlign: 'left' }}>
                    <div className="row" >
                        <div className="manual-form-row category-row" style={{ display: 'flex', gap: '20px', flexDirection: 'row' }}>
                            <div className="manual-form-group">
                                <label
                                    style={{ width: '110px', flexShrink: 0 }}>Category</label>
                                <Dropdown
                                    className="dropdown-compact"
                                    value={form.DM_CategoryID}
                                    options={categoryOptions}
                                    onChange={e => setForm(prev => ({ ...prev, DM_CategoryID: e.value }))}
                                    placeholder="Select a Category"
                                    style={{ width: '450px' }}
                                />
                            </div>
                            <div className="manual-form-group2" style={{ display: 'flex', textAlign: 'center'}}>
                                <Checkbox
                                    className="dropdown-compact"
                                    checked={form.IsMainTitle === 1}
                                    onChange={e => setForm(prev => ({ ...prev, IsMainTitle: e.checked ? 1 : 0 }))}
                                />
                                <label style={{ width: '120px', textAlign: 'left', marginLeft: '5px' }}>Main Title</label>
                                <Checkbox
                                    className="dropdown-compact"
                                    checked={form.CanExport === 1}
                                    onChange={e => setForm(prev => ({ ...prev, CanExport: e.checked ? 1 : 0 }))}
                                />
                                <label style={{ width: '150px', textAlign: 'left', marginLeft: '5px' }}>Allow Export</label>
                            </div>
                        </div>
                        <div className="manual-form-row code-row" style={{ display: 'flex', gap: '20px', flexDirection: 'row' }}>
                            <div className="manual-form-group">
                                <label
                                    style={{ width: '110px', flexShrink: 0 }}>Manual Code</label>
                                <input
                                    className="form-control"
                                    name="ManualCode"
                                    value={form.ManualCode}
                                    onChange={handleChange}
                                    style={{ width: '450px' }}
                                />
                            </div>
                            <div className="manual-form-group2" style={{ display: 'flex', textAlign: 'center'}}>
                                <Checkbox
                                    className="dropdown-compact"
                                    checked={form.IsAcknowledgementRequired === 1}
                                    onChange={e => setForm(prev => ({ ...prev, IsAcknowledgementRequired: e.checked ? 1 : 0 }))}
                                />
                                <label style={{ width: '250px', textAlign: 'left', marginLeft: '5px' }}>Acknowledgement Required</label>
                            </div>
                        </div>
                        <div className="manual-form-group manual-name-row">
                            <label style={{ width: '110px', flexShrink: 0 }}>Manual Name</label>
                            <input
                                className="form-control"
                                name="ManualName"
                                value={form.ManualName}
                                onChange={handleChange}
                                style={{ width: '770px' }}
                            />
                        </div>
                        <div className="manual-form-row approval-row" style={{ display: 'flex', gap: '20px', flexDirection: 'row', height: '100px' }}>
                            <div className="manual-form-group">
                                <label style={{ width: '110px', flexShrink: 0 }}>Aprpoval Flow</label>
                                <Checkbox
                                    className="dropdown-compact"
                                    checked={form.IsApprovalRequired === 1}
                                    onChange={e => {
                                        const checked = !!e.checked;
                                        setForm(prev => ({
                                            ...prev,
                                            IsApprovalRequired: checked ? 1 : 0,
                                            Approval_FlowID: checked ? prev.Approval_FlowID : -1
                                        }));
                                    }}
                                />
                                <label style={{ width: '150px', textAlign: 'left', marginLeft: '5px' }}>Approval Required</label>
                                <Dropdown
                                    className="dropdown-compact"
                                    value={form.Approval_FlowID}
                                    options={approvalFlowOptions}
                                    onChange={e => setForm(prev => ({ ...prev, Approval_FlowID: e.value }))}
                                    placeholder="Select a flow"
                                    style={{ width: '250px', height: '40px' }}
                                    disabled={!form.IsApprovalRequired} 
                                />
                            </div>
                            {form.Approval_FlowID > 0 && (
                                <div className="manual-form-group2" style={{ display: 'flex', textAlign: 'center'}}>
                                    <ApprovalFlow currentFlow={form.Approval_FlowID} />
                                </div>
                            )}
                        </div>
                        <div className="manual-form-group1 context-section">
                            <div className="manual-form-group">
                                <label style={{ width: '110px', flexShrink: 0 }}>Context</label>
                                <ContextMenu model={contextMenuItems} ref={menu} style={{ minWidth: '150px' }} />
                                <a onClick={e => menu.current?.show(e)} style={{ marginLeft: '5px', fontSize: '16px' }}>Import</a>
                                <input type="file" accept="application/pdf" onChange={handleFileChange} />
                            </div>
                            <div className="col-sm-9" style={{ width: '100%', height: '355px' }}>
                                <JoditEditor
                                    config={config}
                                    value={form.TextContents}
                                    tabIndex={1}
                                    onBlur={newContent => setForm(prev => ({ ...prev, TextContents: sanitizeHtml(newContent) }))}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
};

export default AddEditManual;