import React, { useState } from 'react';
import DocumentVesselList, { Vessel } from './DocumentVesselList';
import VesselDocuments from './VesselDocuments';
import { ReportPanel } from '../../Reports/ReportsPage';
import '../../Reports/ReportsPage.scss';
import './DashboardOtherDocument.scss';
import '../../Features/Features.scss';

export interface DashboardProps {
    userId: string;
}

/**
 * Other Documents: pick a vessel on the left; its folders and documents open on the right, with
 * "New folder" and "New document". Documents added here stay at the office; documents added on board come up.
 * "All vessels" at the top of the list opens the fleet-wide reports (documents register).
 */
const DashboardOtherDocuments: React.FC<DashboardProps> = () => {
    const [vessel, setVessel] = useState<Vessel | null>(null);
    const [allVessels, setAllVessels] = useState(false);

    return (
        <div className="dashboard-wrapper other-documents-dashboard">
            <div className="od-layout">
                <DocumentVesselList
                    selectedVesselId={vessel?.vesselID ?? null}
                    onSelectionChange={(list) => { setVessel(list[0] ?? null); setAllVessels(false); }}
                    allSelected={allVessels}
                    onAllVessels={() => { setAllVessels((on) => !on); setVessel(null); }}
                />

                <section className={`od-panel${allVessels ? ' od-panel--reports' : ''}`}>
                    {allVessels ? (
                        <ReportPanel context="documents" layout="tabs" />
                    ) : vessel ? (
                        <VesselDocuments
                            key={vessel.vesselID}
                            vesselId={vessel.vesselID}
                            vesselName={vessel.vslName}
                            vesselMeta={[vessel.vslCode, vessel.vslType].filter(Boolean).join(' · ')}
                        />
                    ) : (
                        <div className="od-empty">
                            <span className="od-empty__icon"><i className="pi pi-folder-open" /></span>
                            <h3>Select a vessel</h3>
                            <p>
                                Its folders and documents open here. Use <strong>New folder</strong> to organise them and
                                {' '}<strong>New document</strong> to add one into a folder.
                            </p>
                            <ul className="od-empty__points">
                                <li><i className="pi pi-arrow-up" /> Documents the crew adds on board come up to the office.</li>
                                <li><i className="pi pi-lock" /> Documents added here stay at the office; they are not sent to the vessel.</li>
                                <li><i className="pi pi-folder" /> Folders made here appear on board too, so the crew can file in them.</li>
                            </ul>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default DashboardOtherDocuments;
