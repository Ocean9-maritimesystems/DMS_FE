import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TabView, TabPanel } from 'primereact/tabview';
import PageHeader from '../PageHeader';
import DashboardManual from './Manuals/DashboardManual';
import DashboardCirculars from './Circulars/DashboardCirculars';
import './Dashboard.scss';

export interface DashboardProps {
    userId: string;
}

const tabMapping: Record<string, number> = {
    manuals: 0,
    circulars: 1,
};

const tabNames = ['manuals', 'circulars'];

/** Tabs that became pages of their own (header links); old links and saved tabs go there. */
const movedTabs: Record<string, string> = {
    pendingacks: '/pending?tab=vessels',
    otherdocuments: '/otherdocuments',
    vesselsyncstatus: '/vessel-sync',
};

const Dashboard: React.FC<DashboardProps> = ({ userId }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const requestedTab =
            location.state?.activeTab ||
            localStorage.getItem('lastDashboardTab') ||
            'manuals';

        const moved = movedTabs[requestedTab];
        if (moved) {
            localStorage.setItem('lastDashboardTab', 'manuals');
            if (location.state?.activeTab === requestedTab) {
                navigate(moved, { replace: true });
                return;
            }
        }

        setActiveIndex(tabMapping[requestedTab] ?? 0);
    }, [location.state, navigate]);

    const handleTabChange = (event: { index: number }) => {
        const nextIndex = event.index;
        setActiveIndex(nextIndex);
        localStorage.setItem(
            'lastDashboardTab',
            tabNames[nextIndex] ?? 'manuals'
        );
    };

    return (
        <>
        <PageHeader title="Dashboard" />
        <main className="dashboard-main">

            <TabView
                activeIndex={activeIndex}
                onTabChange={handleTabChange}
                className="dashboard-tabs"
            >
                <TabPanel
                    header={
                        <div className="tab-header">
                            <i className="pi pi-book" />
                            <span>Manuals</span>
                        </div>
                    }
                >
                    <DashboardManual userId={userId} />
                </TabPanel>

                <TabPanel
                    header={
                        <div className="tab-header">
                            <i className="pi pi-bell" />
                            <span>Circulars &amp; Alerts</span>
                        </div>
                    }
                >
                    <DashboardCirculars userId={userId} />
                </TabPanel>
            </TabView>
        </main>
        </>
    );
};

export default Dashboard;