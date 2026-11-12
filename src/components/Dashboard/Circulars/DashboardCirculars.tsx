import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import MetricCard from './MetricCardCicrular';
import NotificationList from './NotificationListCicrular';
import CircularsChart from './CircularsChart';
import RecentCircularsList from './RecentCircularsList';
import './RecentCircularsList.scss';
import ReportDialog from '../../Reports/ReportDialog';
import { ReportContextKey } from '../../Reports/reportCatalog';

export interface DashboardProps {
    userId: string;
}

const DashboardCirculars: React.FC<DashboardProps> = ({ userId }) => {
    const [totalCirculars, setTotalCirculars] = useState(0);
    const [totalAlerts, setTotalAlerts] = useState(0);
    
    const [reports, setReports] = useState<ReportContextKey | null>(null);
    const navigate = useNavigate();

    const setUserActionCounts = () => {
        dmsLifecycleService.getApiCall<{ totalCirculars?: number; totalAlerts?: number } | null>(`Circular/GetDashboardCircularCounts`)
            .then((data) => {
                if (data) {
                    setTotalCirculars(data.totalCirculars || 0);
                    setTotalAlerts(data.totalAlerts || 0);
                }
            })
            .catch(() => {
                setTotalCirculars(0);
                setTotalAlerts(0);
            });
    };

    const metricsData = [
        { 
            number: totalCirculars, 
            label: "Total Circulars", 
            subtext: "All accessible circulars",
            icon: "pi pi-envelope", 
            css: "primary", 
            color: "blue", 
            action: () => navigate('/circulars?cirmode=circulars') 
        },
        { 
            number: "Open", 
            label: "View Circulars Report", 
            subtext: "Register and acknowledgements",
            icon: "pi pi-chart-bar",
            css: "info", 
            color: "blue", 
            action: () => setReports('circulars')
        },
        { 
            number: totalAlerts, 
            label: "Total Alerts", 
            subtext: "All accessible alerts", 
            icon: "pi pi-bell", 
            css: "primary", 
            color: "blue", 
            action: () => navigate('/circulars?cirmode=alerts') 
        },
        { 
            number: "Open", 
            label: "View Alerts Report", 
            subtext: "Register and acknowledgements", 
            icon: "pi pi-chart-bar", 
            css: "info", 
            color: "blue", 
            action: () => setReports('alerts')
        },
    ];

    useEffect(() => {   
        setUserActionCounts();
    }, [userId]);
   
    return (
        <div className='dashboard-wrapper'>
            <div className="dashboard-container">
                <div className="dashboard-stats">
                    {metricsData.map((data, index) => (
                        <MetricCard key={index} {...data} />
                    ))}
                </div>

                <div className="dashboard-content-circulars">
                    <div className="dashboard-card">
                        <RecentCircularsList userId={userId} circularType="circulars" limit={5} />
                    </div>
                    <div className="dashboard-card">
                        <CircularsChart circularType="circulars" />
                    </div>
                    <div className="dashboard-card">
                        <RecentCircularsList userId={userId} circularType="alerts" limit={5} />
                    </div>
                    <div className="dashboard-card">
                        <CircularsChart circularType="alerts" />
                    </div>
                 </div>

                <div className="dashboard-stats">
                   <div className="dashboard-card notifications-card">
                       <NotificationList userId={userId}></NotificationList>
                    </div>
                </div>
            </div>
            <ReportDialog context={reports} onHide={() => setReports(null)} />
        </div>
    );
};

export default DashboardCirculars;
