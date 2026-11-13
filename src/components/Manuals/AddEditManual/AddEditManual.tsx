import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
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
    const pdfInput = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState<string | null>(null);
    /** The manual code last filled in from the category; a code the user typed is never replaced. */
    const autoCodeRef = useRef('');
    const codeRequestRef = useRef(0);

    // Made once: a new config object on every render made the editor start again (losing what was just pasted or typed).
    const config = useMemo(() => ({
        readonly: false,
        // Paste straight in. Jodit's "keep as HTML / insert as text?" question opened behind this dialog, so a paste
        // never finished. Word formatting is tidied when the text is saved (sanitizeHtml / tidyWordBullets).
        askBeforePasteHTML: false,
        askBeforePasteFromWord: false,
        defaultActionOnPaste: 'insert_as_html' as const,
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
    }), []);

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

    /** Like the circular number: choosing a category on a new manual fills in its next manual code. */
    const handleCategoryChange = (categoryID: string) => {
        setForm(prev => ({ ...prev, DM_CategoryID: categoryID }));
        if (!categoryID || selectedAction === 'Edit') return;
        const requestId = ++codeRequestRef.current;
        dmsLifecycleService.getApiCall<{ manualCode?: string } | null>(`Manuals/GetNextManualCode?categoryId=${encodeURIComponent(categoryID)}`)
            .then(data => {
                const code = data?.manualCode ?? '';
                if (requestId !== codeRequestRef.current || !code) return;
                const previous = autoCodeRef.current;
                autoCodeRef.current = code;
                setForm(prev => (prev.ManualCode.trim() === '' || prev.ManualCode === previous ? { ...prev, ManualCode: code } : prev));
            })
            .catch(() => {
                console.error('Failed to fetch the next manual code');
            });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    /** What has to be filled in before it can be saved (null when nothing). */
    const check = (): string | null => {
        if (!form.ManualName.trim()) return 'Enter the manual name.';
        if (form.IsApprovalRequired === 1 && !(form.Approval_FlowID > 0)) return 'Choose the approval flow, or untick "Approval required".';
        return null;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const p = check();
        setProblem(p);
        if (!p) onSubmit(form);
    };

    const handlePublish = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const p = check();
        setProblem(p);
        if (!p) onSubmit({ ...form, IsToPublish: true });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) {
            return;
        }
        const file = e.target.files[0];
        e.target.value = ''; // the same file can be imported again
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
        <form onSubmit={handleSubmit} className="add-edit-manual-form mf" noValidate>
            <div className="mf-bar">
                <span className="mf-status" title="Status">{form.StatusString || 'NEW'}</span>
                {problem && <span className="mf-problem" role="alert"><i className="pi pi-exclamation-circle" aria-hidden="true" /> {problem}</span>}
                <div className="mf-bar__actions">
                    <button type="button" className="mf-btn mf-btn--text" onClick={closeForm}>Cancel</button>
                    <button type="submit" className="mf-btn" title="Save; it stays a draft until it is published">
                        <i className="pi pi-save" aria-hidden="true" /> Save draft
                    </button>
                    <button type="button" className="mf-btn mf-btn--primary" onClick={handlePublish}
                        title="Save and send it for approval (or release it, when no approval is needed)">
                        <i className="pi pi-send" aria-hidden="true" /> Publish
                    </button>
                </div>
            </div>

            <div className="mf-grid">
                <div className="mf-field">
                    <label htmlFor="mf-category">Category</label>
                    <Dropdown
                        inputId="mf-category"
                        value={form.DM_CategoryID}
                        options={categoryOptions}
                        onChange={e => handleCategoryChange(e.value)}
                        placeholder="Choose a category"
                        filter={categoryOptions.length > 8}
                    />
                </div>
                <div className="mf-field">
                    <label htmlFor="mf-code">Manual code</label>
                    <input
                        id="mf-code"
                        className="form-control"
                        name="ManualCode"
                        value={form.ManualCode}
                        onChange={handleChange}
                        maxLength={20}
                        placeholder={selectedAction === 'Edit' ? '' : 'Filled in when you choose the category'}
                    />
                </div>
                <div className="mf-field mf-field--wide">
                    <label htmlFor="mf-name">Manual name <span className="mf-req" aria-hidden="true">*</span></label>
                    <input
                        id="mf-name"
                        className={`form-control${problem && !form.ManualName.trim() ? ' is-invalid' : ''}`}
                        name="ManualName"
                        value={form.ManualName}
                        onChange={handleChange}
                        maxLength={250}
                        aria-required="true"
                    />
                </div>
            </div>

            <fieldset className="mf-options">
                <legend>Options</legend>
                <label className="mf-check">
                    <Checkbox checked={form.IsMainTitle === 1} onChange={e => setForm(prev => ({ ...prev, IsMainTitle: e.checked ? 1 : 0 }))} />
                    <span>Main title</span>
                </label>
                <label className="mf-check">
                    <Checkbox checked={form.CanExport === 1} onChange={e => setForm(prev => ({ ...prev, CanExport: e.checked ? 1 : 0 }))} />
                    <span>Allow export<small>Can be downloaded as PDF or Word</small></span>
                </label>
                <label className="mf-check">
                    <Checkbox checked={form.IsAcknowledgementRequired === 1} onChange={e => setForm(prev => ({ ...prev, IsAcknowledgementRequired: e.checked ? 1 : 0 }))} />
                    <span>Acknowledgement required<small>Readers must confirm they have read it</small></span>
                </label>
                <label className="mf-check">
                    <Checkbox
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
                    <span>Approval required<small>Goes through an approval flow before release</small></span>
                </label>
                {form.IsApprovalRequired === 1 && (
                    <div className="mf-flow">
                        <label htmlFor="mf-flow">Approval flow <span className="mf-req" aria-hidden="true">*</span></label>
                        <Dropdown
                            inputId="mf-flow"
                            className={problem && form.Approval_FlowID <= 0 ? 'p-invalid' : ''}
                            value={form.Approval_FlowID > 0 ? form.Approval_FlowID : null}
                            options={approvalFlowOptions}
                            onChange={e => setForm(prev => ({ ...prev, Approval_FlowID: e.value }))}
                            placeholder="Choose a flow"
                        />
                        {form.Approval_FlowID > 0 && <div className="mf-flow__steps"><ApprovalFlow currentFlow={form.Approval_FlowID} /></div>}
                    </div>
                )}
            </fieldset>

            <div className="mf-content">
                <div className="mf-content__head">
                    <span className="mf-content__title">Content</span>
                    <input ref={pdfInput} type="file" accept="application/pdf" hidden onChange={handleFileChange} />
                    <button type="button" className="mf-btn mf-btn--small" onClick={() => pdfInput.current?.click()}
                        title="Puts the text of the PDF's first page into the editor">
                        <i className="pi pi-file-pdf" aria-hidden="true" /> Import text from a PDF
                    </button>
                </div>
                <div className="mf-editor">
                    <JoditEditor
                        config={config}
                        value={form.TextContents}
                        tabIndex={1}
                        onBlur={newContent => setForm(prev => ({ ...prev, TextContents: sanitizeHtml(newContent) }))}
                    />
                </div>
            </div>
        </form>
    );
};

export default AddEditManual;