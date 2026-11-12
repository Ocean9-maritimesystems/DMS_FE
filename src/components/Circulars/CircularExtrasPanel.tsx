import React, { useCallback, useEffect, useState } from 'react';
import { AutoComplete } from 'primereact/autocomplete';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { SelectButton } from 'primereact/selectbutton';
import featureApi, { CircularExtras, CircularManualLink, itemLink, SearchHit } from '../../services/featureApi';
import { errorMessage } from '../../services/DMSLifecycleService';
import notify from '../../services/notify';
import { formatDate } from '../utils/formatDate';
import ManualPreviewDialog from './ManualPreviewDialog';
import CircularPreviewDialog from './CircularPreviewDialog';
import '../Features/Features.scss';

/**
 * How a circular relates to a manual. "Supersedes" was merged into "Amends" (the app treated them the same:
 * both stay open on the manual until a revision takes them in). Links saved earlier as Supersedes show as Amends.
 */
export const LINK_TYPES = [
    { label: 'Amends', value: 'Amends' },
    { label: 'Refers to', value: 'RefersTo' },
];

const linkTypeText = (t: string) => (t === 'Supersedes' ? 'Amends' : LINK_TYPES.find((x) => x.value === t)?.label ?? t);

const isoDate = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

const hitText = (h: SearchHit) => `${h.number ? `${h.number} – ` : ''}${h.title ?? ''}`;

/**
 * Picks a manual or circular through the search API.
 * The choice is kept when a suggestion is picked (onSelect). Typing again clears it. (forceSelection is not
 * used: it compared the box's text "1.0 – SMS" with the title "SMS", found no match on leaving the box and
 * dropped the choice, so "Link" then said no manual was chosen.)
 */
const ItemPicker: React.FC<{
    type: 'Manual' | 'Circular';
    value: SearchHit | null;
    onChange: (h: SearchHit | null) => void;
    placeholder: string;
    inputId?: string;
    autoFocus?: boolean;
}> = ({ type, value, onChange, placeholder, inputId, autoFocus }) => {
    const [suggestions, setSuggestions] = useState<SearchHit[]>([]);
    const [typed, setTyped] = useState<string | SearchHit>(value ?? '');
    return (
        <AutoComplete
            inputId={inputId}
            autoFocus={autoFocus}
            value={typed}
            suggestions={suggestions}
            field="title"
            placeholder={placeholder}
            delay={250}
            className="item-picker"
            panelClassName="item-picker-panel"
            itemTemplate={(h: SearchHit) => (
                <div className="item-picker-option">
                    <i className={type === 'Manual' ? 'pi pi-book' : h.itemType === 'Alert' ? 'pi pi-exclamation-triangle' : 'pi pi-megaphone'} aria-hidden="true" />
                    {h.number && <strong>{h.number}</strong>}
                    <span>{h.title}</span>
                </div>
            )}
            selectedItemTemplate={(h: SearchHit) => hitText(h)}
            completeMethod={(e) => featureApi.search(e.query, type)
                .then((hits) => setSuggestions(hits.filter((h) => type === 'Manual' ? h.itemType === 'Manual' : h.itemType === 'Circular' || h.itemType === 'Alert')))
                .catch(() => setSuggestions([]))}
            onSelect={(e) => { setTyped(e.value as SearchHit); onChange(e.value as SearchHit); }}
            onChange={(e) => {
                setTyped(e.value);
                if (typeof e.value === 'string' || !e.value) onChange(null);
            }}
            emptyMessage="Nothing found"
            showEmptyMessage
        />
    );
};

/** The chosen manual or circular, with a button to pick another. */
const PickedItem: React.FC<{ hit: SearchHit; icon: string; onClear: () => void }> = ({ hit, icon, onClear }) => (
    <div className="picked-item">
        <span className="picked-item-icon"><i className={icon} aria-hidden="true" /></span>
        <div className="picked-item-text">
            {hit.number && <strong>{hit.number}</strong>}
            <span>{hit.title}</span>
        </div>
        <Button type="button" label="Change" icon="pi pi-pencil" text size="small" onClick={onClear} />
    </div>
);

/** What each choice means, and what it does in the app (shown under the choice in "Link a manual"). */
const LINK_HELP: Record<string, string> = {
    Amends: 'The circular changes or replaces part of the manual (name the section below). The manual shows it as '
        + 'an open amendment until a new revision takes it in ("Amendments taken into this manual").',
    RefersTo: 'The circular only mentions the manual for reference; nothing in the manual changes. Listed on the '
        + 'manual, never shown as open.',
};

/**
 * Features 3 and 7 on a circular / alert: days to acknowledge, "valid until", the manuals it amends or refers to,
 * and cancel / supersede. Shown in the circular's detail pane.
 */
const CircularExtrasPanel: React.FC<{ circularId: number; canEdit?: boolean; onChanged?: () => void }> = ({ circularId, canEdit = true, onChanged }) => {
    const [extras, setExtras] = useState<CircularExtras | null>(null);
    const [ackDays, setAckDays] = useState<number | null>(null);
    const [validUntil, setValidUntil] = useState<Date | null>(null);
    const [busy, setBusy] = useState(false);
    const [showLink, setShowLink] = useState(false);
    const [preview, setPreview] = useState<CircularManualLink | null>(null);
    const [showCancel, setShowCancel] = useState(false);
    const [showRelease, setShowRelease] = useState(false);

    const load = useCallback(async () => {
        try {
            const e = await featureApi.circular.get(circularId);
            setExtras(e);
            setAckDays(e.ackDueDays ?? null);
            setValidUntil(e.validUntil ? new Date(e.validUntil) : null);
        } catch {
            setExtras(null); // 012 not run yet, or no such circular: hide the panel
        }
    }, [circularId]);

    useEffect(() => { load(); }, [load]);

    if (!extras) return null;

    // "Valid until" is no longer edited here; a date already stored is kept when the days are saved.
    const dirty = (extras.ackDueDays ?? null) !== ackDays;

    const save = async () => {
        setBusy(true);
        try {
            await featureApi.circular.save(circularId, ackDays, isoDate(validUntil));
            notify.success('Saved');
            await load();
            onChanged?.();
        } catch (err) {
            notify.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const removeLink = async (l: CircularManualLink) => {
        try {
            await featureApi.circular.removeLink(l.ciR_ManualLinkID);
            load();
        } catch (err) {
            notify.error(errorMessage(err));
        }
    };

    const cancelled = extras.status === 'Cancelled';
    const isDraft = extras.status === 'Draft';
    const expired = !!extras.validUntil && new Date(extras.validUntil) < new Date(new Date().toDateString());

    return (
        <div className="feature-card extras-panel">
            <h4><i className="pi pi-link" /> Acknowledgement and related manuals
                {cancelled && <span className="feature-tag cancelled">Cancelled{extras.supersededByNumber ? ` – superseded by ${extras.supersededByNumber}` : ''}</span>}
                {!cancelled && expired && <span className="feature-tag expired">No longer valid</span>}
                {isDraft && <span className="feature-tag muted">Draft – not sent to the vessels yet</span>}
            </h4>
            <div className="extras-row">
                <div className="field extras-days">
                    <label htmlFor={`ack-${circularId}`}>Days to acknowledge</label>
                    <InputNumber inputId={`ack-${circularId}`} value={ackDays} min={0} max={3650} useGrouping={false} disabled={!canEdit || cancelled}
                        onValueChange={(e) => setAckDays(e.value ?? null)} placeholder="Default" size={6} />
                </div>
                {canEdit && !cancelled && <Button label="Save" icon="pi pi-check" size="small" loading={busy} disabled={!dirty} onClick={save} />}
                <span style={{ flex: 1 }} />
                {canEdit && (
                    <Button label={extras.links.length > 0 ? 'Link another manual' : 'Link a manual'} icon="pi pi-plus" size="small" outlined
                        onClick={() => setShowLink(true)} />
                )}
                {canEdit && isDraft && (
                    <span className="release-action">
                        {dirty && <span className="release-hint">Save your changes first</span>}
                        <Button label="Release" icon="pi pi-send" size="small" onClick={() => setShowRelease(true)}
                            disabled={dirty} title="Send this circular to the vessels" />
                    </span>
                )}
                {canEdit && !cancelled && extras.status !== 'Temp' && (
                    <Button label={isDraft ? 'Cancel circular' : 'Cancel / supersede'} icon="pi pi-ban" size="small" severity="danger" outlined
                        onClick={() => setShowCancel(true)} />
                )}
            </div>
            <div className="extras-links">
                {extras.links.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No manuals linked.</span>}
                {extras.links.map((l) => {
                    const link = itemLink('Manual', l.dM_ManualID);
                    return (
                        <div key={l.ciR_ManualLinkID} className="link-line">
                            <span className={`feature-tag ${l.isActive ? 'info' : 'muted'}`}>{linkTypeText(l.linkType)}</span>
                            <a href={`${link.pathname}${link.search ?? ''}`} className="link-line-open" title="Show the manual"
                                onClick={(e) => {
                                    // Ctrl/Shift/middle click still opens the Manuals page in a new tab.
                                    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                                    e.preventDefault();
                                    setPreview(l);
                                }}>
                                <i className="pi pi-eye" aria-hidden="true" /> {l.manualNo} {l.manualName}
                            </a>
                            {l.remarks && <span style={{ color: 'var(--text-muted)' }}>– {l.remarks}</span>}
                            {!l.isActive && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(taken into the manual {formatDate(l.closedOn)})</span>}
                            {canEdit && <Button icon="pi pi-times" text rounded size="small" aria-label="Remove link" onClick={() => removeLink(l)} />}
                        </div>
                    );
                })}
            </div>

            {preview && (
                <ManualPreviewDialog manualId={preview.dM_ManualID} manualNo={preview.manualNo} manualName={preview.manualName}
                    linkTypeText={linkTypeText(preview.linkType)} remarks={preview.remarks} onHide={() => setPreview(null)} />
            )}
            {showLink && <AddLinkDialog circularId={circularId} onHide={() => setShowLink(false)} onSaved={() => { setShowLink(false); load(); }} />}
            {showRelease && (
                <ReleaseDialog circularId={circularId} onHide={() => setShowRelease(false)}
                    onReleased={() => { setShowRelease(false); load(); onChanged?.(); }} />
            )}
            {showCancel && (
                <CancelDialog circularId={circularId} isDraft={isDraft} onHide={() => setShowCancel(false)}
                    onSaved={() => { setShowCancel(false); load(); onChanged?.(); }} />
            )}
        </div>
    );
};

const AddLinkDialog: React.FC<{ circularId: number; onHide: () => void; onSaved: () => void }> = ({ circularId, onHide, onSaved }) => {
    const [manual, setManual] = useState<SearchHit | null>(null);
    const [linkType, setLinkType] = useState('Amends');
    const [remarks, setRemarks] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async () => {
        if (!manual) { notify.warn('Pick a manual from the list first.'); return; }
        setBusy(true);
        try {
            await featureApi.circular.addLink(circularId, manual.itemID, linkType, remarks.trim());
            notify.success(`Linked to ${hitText(manual)}.`);
            onSaved();
        } catch (err) {
            notify.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <div className="feature-dialog-footer">
            <Button type="button" label="Cancel" text onClick={onHide} />
            <Button type="button" label="Link manual" icon="pi pi-link" loading={busy} disabled={!manual} onClick={save} />
        </div>
    );

    return (
        <Dialog header="Link a manual" visible onHide={onHide} footer={footer} className="feature-dialog"
            style={{ width: '560px', maxWidth: '96vw' }} draggable={false}>
            <div className="feature-form single">
                <div className="field full">
                    <label htmlFor="al-manual">Manual</label>
                    {manual ? (
                        <PickedItem hit={manual} icon="pi pi-book" onClear={() => setManual(null)} />
                    ) : (
                        <>
                            <ItemPicker inputId="al-manual" type="Manual" value={null} onChange={setManual} autoFocus
                                placeholder="Type a manual number or name, then pick it from the list" />
                            <span className="hint">Pick a manual from the list that appears while you type.</span>
                        </>
                    )}
                </div>
                <div className="field full">
                    <label id="al-type">This circular…</label>
                    <SelectButton value={linkType} options={LINK_TYPES} aria-labelledby="al-type" className="link-type-select"
                        onChange={(e) => e.value && setLinkType(e.value)} />
                    <span className="hint">{LINK_HELP[linkType]}</span>
                </div>
                <div className="field full">
                    <label htmlFor="al-rem">Section / remarks <span className="optional">(optional)</span></label>
                    <InputText id="al-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500}
                        placeholder="e.g. Section 4.2 Bunkering" />
                </div>
            </div>
        </Dialog>
    );
};

/** Confirms releasing a draft: what will happen, then POST api/Circular/{id}/Release. */
const ReleaseDialog: React.FC<{ circularId: number; onHide: () => void; onReleased: () => void }> = ({ circularId, onHide, onReleased }) => {
    const [busy, setBusy] = useState(false);

    const release = async () => {
        setBusy(true);
        try {
            await featureApi.circular.release(circularId);
            notify.success('Released. The vessels get it with the next sync.');
            onReleased();
        } catch (err) {
            notify.error(errorMessage(err), 'Not released');
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <div className="feature-dialog-footer">
            <Button type="button" label="Back" text onClick={onHide} />
            <Button type="button" label="Release" icon="pi pi-send" loading={busy} onClick={release} />
        </div>
    );

    return (
        <Dialog header="Release this circular?" visible onHide={onHide} footer={footer} className="feature-dialog"
            style={{ width: '520px', maxWidth: '96vw' }} draggable={false}>
            <div className="release-note">
                <p>Once released:</p>
                <ul>
                    <li>its status becomes <strong>Active</strong> and today becomes its released date;</li>
                    <li>the selected vessels get it with the next sync and see it in their inbox;</li>
                    <li>the crew must acknowledge it within the days set above;</li>
                    <li>manuals it amends show it as an open amendment.</li>
                </ul>
                <p className="release-warn"><i className="pi pi-info-circle" aria-hidden="true" /> It can no longer go back to draft; after this it can only be cancelled or superseded.</p>
            </div>
        </Dialog>
    );
};

const CancelDialog: React.FC<{ circularId: number; isDraft?: boolean; onHide: () => void; onSaved: () => void }> = ({ circularId, isDraft, onHide, onSaved }) => {
    const [by, setBy] = useState<SearchHit | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await featureApi.circular.cancel(circularId, by?.itemID ?? null, reason.trim());
            notify.success(isDraft ? 'Cancelled. It was never sent to the vessels.' : 'Cancelled; the vessels are told with the next sync.');
            onSaved();
        } catch (err) {
            notify.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <div className="feature-dialog-footer">
            <Button type="button" label="Back" text onClick={onHide} />
            <Button type="button" label="Cancel circular" icon="pi pi-ban" severity="danger" loading={busy} onClick={save} />
        </div>
    );

    return (
        <Dialog header={isDraft ? 'Cancel this draft?' : 'Cancel or supersede'} visible onHide={onHide} footer={footer} className="feature-dialog"
            style={{ width: '560px', maxWidth: '96vw' }} draggable={false}>
            {isDraft && (
                <p className="release-warn" style={{ marginBottom: 14 }}>
                    <i className="pi pi-info-circle" aria-hidden="true" /> This draft was never released, so no vessel has it. It stays in the list as Cancelled and can no longer be released.
                </p>
            )}
            <div className="feature-form single">
                <div className="field full">
                    <label htmlFor="cc-by">Superseded by <span className="optional">(optional)</span></label>
                    {by ? (
                        <PickedItem hit={by} icon={by.itemType === 'Alert' ? 'pi pi-exclamation-triangle' : 'pi pi-megaphone'} onClear={() => setBy(null)} />
                    ) : (
                        <ItemPicker inputId="cc-by" type="Circular" value={null} onChange={setBy} placeholder="The circular that replaces it" />
                    )}
                </div>
                <div className="field full">
                    <label htmlFor="cc-reason">Reason</label>
                    <InputTextarea id="cc-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoResize />
                </div>
            </div>
        </Dialog>
    );
};

/**
 * On a manual: the circulars and alerts that amend or refer to it. Hidden when there are none.
 * A circular opens in a popup, so the manual stays on screen.
 */
export const ManualRelatedCirculars: React.FC<{ manualId: number }> = ({ manualId }) => {
    const [links, setLinks] = useState<CircularManualLink[]>([]);
    const [preview, setPreview] = useState<CircularManualLink | null>(null);

    const load = useCallback(async () => {
        if (!manualId || manualId <= 0) { setLinks([]); return; }
        try {
            setLinks(await featureApi.circular.forManual(manualId));
        } catch {
            setLinks([]);
        }
    }, [manualId]);

    useEffect(() => { load(); }, [load]);

    if (links.length === 0) return null;

    // Drafts are listed (marked Draft) but are not open amendments until the circular is released.
    const isDraft = (l: CircularManualLink) => l.circularStatus === 'Draft' || l.circularStatus === 'Temp';
    const isAlert = (l: CircularManualLink) => !!l.circularType?.toLowerCase().startsWith('alert');
    const open = links.filter((l) => l.isActive && l.circularStatus !== 'Cancelled' && !isDraft(l));

    const closeLinks = async () => {
        try {
            await featureApi.circular.closeLinks(manualId);
            notify.success('Marked as taken into this manual.');
            load();
        } catch (err) {
            notify.error(errorMessage(err));
        }
    };

    return (
        <div className="feature-card extras-panel related-circulars">
            <div className="related-circulars-head">
                <h4><i className="pi pi-megaphone" /> Related circulars and alerts
                    {open.length > 0 && <span className="feature-tag warn">{open.length} open amendment{open.length === 1 ? '' : 's'}</span>}
                </h4>
                {open.some((l) => l.linkType !== 'RefersTo') && (
                    <Button label="Amendments taken into this manual" icon="pi pi-check" size="small" outlined onClick={closeLinks}
                        tooltip="Use after releasing the revision that includes them" tooltipOptions={{ position: 'left' }} />
                )}
            </div>
            <div className="extras-links">
                {links.map((l) => {
                    const link = itemLink(isAlert(l) ? 'Alert' : 'Circular', l.ciR_MasterID);
                    return (
                        <div key={l.ciR_ManualLinkID} className="link-line">
                            <span className={`feature-tag ${l.isActive && !isDraft(l) ? 'info' : 'muted'}`}>{linkTypeText(l.linkType)}</span>
                            <a href={`${link.pathname}${link.search ?? ''}`} className="link-line-open" title="Show the circular"
                                onClick={(e) => {
                                    // Ctrl/Shift/middle click still opens the Circulars page in a new tab.
                                    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                                    e.preventDefault();
                                    setPreview(l);
                                }}>
                                <i className="pi pi-eye" aria-hidden="true" /> {l.circularNumber} {l.circularTitle}
                            </a>
                            {l.remarks && <span style={{ color: 'var(--text-muted)' }}>– {l.remarks}</span>}
                            {l.circularStatus === 'Cancelled' && <span className="feature-tag cancelled">Cancelled</span>}
                            {isDraft(l) && <span className="feature-tag muted" title="Not released yet">Draft</span>}
                            {!l.isActive && !isDraft(l) && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(taken in {formatDate(l.closedOn)})</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {preview && (
                <CircularPreviewDialog circularId={preview.ciR_MasterID} number={preview.circularNumber} title={preview.circularTitle}
                    isAlert={isAlert(preview)} linkTypeText={linkTypeText(preview.linkType)} remarks={preview.remarks}
                    onHide={() => setPreview(null)} />
            )}
        </div>
    );
};

export default CircularExtrasPanel;
