import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../PageHeader';
import DashboardVesselSyncStatus from './VesselSyncStatus/DashboardVesselSyncStatus';
import { ReportView } from '../Reports/ReportsPage';
import { reportByKey } from '../Reports/reportCatalog';
import featureApi, { VesselOption } from '../../services/featureApi';
import './Dashboard.scss';
import '../Reports/ReportsPage.scss';
import './VesselSyncPage.scss';

type Tab = 'status' | 'history';

const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'status', label: 'Status', icon: 'pi pi-sync' },
    { key: 'history', label: 'Sync history', icon: 'pi pi-history' },
];

/** Every download and upload between the office and the vessels (the "sync-log" report: filters and Excel / PDF / CSV export). */
const SYNC_HISTORY = reportByKey('sync-log')!;

/** Vessel sync as its own page (header link): the live status, and the sync history. The tab is in the address (?tab=history). */
const VesselSyncPage: React.FC = () => {
    const [params, setParams] = useSearchParams();
    const tab: Tab = params.get('tab') === 'history' ? 'history' : 'status';
    const [vessels, setVessels] = useState<VesselOption[]>([]);

    useEffect(() => {
        if (tab === 'history' && vessels.length === 0) featureApi.vessels().then(setVessels).catch(() => setVessels([]));
    }, [tab, vessels.length]);

    return (
        <>
            <PageHeader title="Vessel sync" subContent={tab === 'history' ? 'Sync history' : 'Status'} />
            <main className="dashboard-main vessel-sync-page">
                <div className="vs-tabs" role="tablist" aria-label="Vessel sync">
                    {TABS.map((t) => (
                        <button key={t.key} type="button" role="tab" id={`vs-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`vs-panel-${t.key}`}
                            className={`vs-tab${tab === t.key ? ' active' : ''}`}
                            onClick={() => setParams(t.key === 'status' ? {} : { tab: t.key }, { replace: true })}>
                            <i className={t.icon} aria-hidden="true" /> {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'status' ? (
                    <div role="tabpanel" id="vs-panel-status" aria-labelledby="vs-tab-status">
                        <DashboardVesselSyncStatus />
                    </div>
                ) : (
                    <div role="tabpanel" id="vs-panel-history" aria-labelledby="vs-tab-history" className="vs-history">
                        <ReportView report={SYNC_HISTORY} vessels={vessels} docTypes={[]} />
                    </div>
                )}
            </main>
        </>
    );
};

export default VesselSyncPage;
