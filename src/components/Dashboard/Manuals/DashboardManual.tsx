import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import MetricCard from './MetricCard';
import ManualChart from './ManualChart';
import ActionItem from './ActionItem';
import NotificationList from './NotificationList';
import ReportDialog from '../../Reports/ReportDialog';
import { ReportContextKey } from '../../Reports/reportCatalog';

export interface DashboardProps {
    userId: string;
}

const DashboardManual: React.FC<DashboardProps> = ({ userId }) => {
    const [newCnt, setNewCnt] = useState(0);
    const [toApprovalCnt, setToApprovalCnt] = useState(0); 
    const [toAckCnt, setToAckCnt] = useState(0); 
    const [releasedCnt, setReleasedCnt] = useState(0); 
    const [userToApproveCnt, setUserToApproveCnt] = useState(0);
    const [userToReviewCnt, setUserToReviewCnt] = useState(0);
    const [userToAckCnt, setUserToAckCnt] = useState(0);
    const [favouriteCnt, setFavouriteCnt] = useState(0);
    const [totalDocuments, setTotalDocuments] = useState(0);
    
    const [reports, setReports] = useState<ReportContextKey | null>(null);
    const navigate = useNavigate();

    const setUserActionCounts = useCallback(() => {
        dmsLifecycleService.getApiCall<{ [count: string]: number | undefined } | null>(`Manuals/GetDashboardManualCounts?userId=${userId}`)
            .then((data) => {
                if (data) {
                    setNewCnt(data.newCnt || 0);
                    setToApprovalCnt(data.toApproveCnt || 0); // API field is toApproveCnt
                    setReleasedCnt(data.releasedCnt || 0);
                    setToAckCnt(data.toAckCnt || 0);
                    setUserToApproveCnt(data.userToApproveCnt || 0);
                    setUserToReviewCnt(data.userToReviewCnt || 0);
                    setUserToAckCnt(data.userToAckCnt || 0);
                    setFavouriteCnt(data.favouriteCnt || 0);
                    setTotalDocuments((data.newCnt || 0) + (data.toApprovalCnt || 0) + (data.releasedCnt || 0) + (data.toAckCnt || 0));
                }
            })
            .catch(() => {
                setNewCnt(0);
                setToApprovalCnt(0);
                setReleasedCnt(0);
                setToAckCnt(0);
                setUserToApproveCnt(0);
                setUserToReviewCnt(0);
                setUserToAckCnt(0);
                setFavouriteCnt(0);
                setTotalDocuments(0);
            });
    }, [userId]);

    useEffect(() => {   
        setUserActionCounts();
    }, [setUserActionCounts]);
   
    const metricsData = [
        { 
            number: totalDocuments,
            label: "Total Documents", 
            subtext: "All accessible documents", 
            icon: "pi pi-file", 
            css: "primary", 
            color: "blue",
            action: () => navigate('/manuals')
        },
        { 
            number: newCnt, 
            label: "New Documents", 
            subtext: "Documents under preparation", 
            icon: "pi pi-plus-circle", 
            css: "info", 
            color: "blue", 
            action: () => navigate('/manuals?mode=new') 
        },
        { 
            number: favouriteCnt, 
            label: "My Favorites", 
            subtext: "Bookmarked documents", 
            icon: "pi pi-star-fill", 
            css: "success", 
            color: "green", 
            action: () => navigate('/manuals?mode=userfavorites') 
        },
        { 
            number: toAckCnt, 
            label: "Vsl Ack Required", 
            subtext: "Vessel acknowledgment required", 
            icon: "pi pi-thumbs-up", 
            css: "info", 
            color: "blue", 
            action: () => navigate('/manuals?mode=vsltoack') 
        },
    ];

    const actionData = [
        { 
            count: userToApproveCnt, 
            text: "Pending Approvals", 
            subtext: "documents need approval", 
            icon: "pi pi-check-circle", 
            css: "approval",
            action: () => navigate('/manuals?mode=pendingapproval') 
        },
        { 
            count: userToReviewCnt, 
            text: "Under Review", 
            subtext: "documents under review", 
            icon: "pi pi-eye", 
            css: "review",
            action: () => navigate('/manuals?mode=underreview') 
        },
        { 
            count: userToAckCnt, 
            text: "Acknowledgment Required", 
            subtext: "documents need acknowledgment", 
            icon: "pi pi-verified", 
            css: "acknowledge",
            action: () => navigate('/manuals?mode=usertoack') 
        }
    ];

     const quickActions = [
        {
            label: 'Browse Manuals',
            icon: 'pi pi-file-o',
            color: 'primary',
            subText: 'View all manuals',
            action: () => navigate('/manuals')
        },
        {
            label: 'Search Manuals',
            icon: 'pi pi-search',
            color: 'primary',
            subText: 'Search manuals',
            action: () => navigate('/search')
        },
        {
            label: 'Reports',
            icon: 'pi pi-chart-bar',
            color: 'success',
            subText: 'Manual and acknowledgement reports',
            action: () => setReports('manuals')
        }
    ];

    return (
        <div className='dashboard-wrapper'>
            <div className="dashboard-container">
                {/* Key Metrics Cards */}
                <div className="dashboard-stats">
                    {metricsData.map((data, index) => (
                        <MetricCard key={index} {...data} />
                    ))}
                </div>

                <div className="dashboard-content-manuals">
                    <div className="charts-section">
                       <ManualChart 
                            newCnt={newCnt} 
                            toApprovalCnt={toApprovalCnt} 
                            releasedCnt={releasedCnt} 
                            toAckCnt={toAckCnt} 
                            totalDocuments={totalDocuments} 
                        />
                    </div>

                    <div className="dashboard-card action-card">
                        <div className="card-header">
                            <h3>Action Required</h3>
                             <div className="stat-icon" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                <i className="pi pi-exclamation-triangle icon-blue" style={{fontSize: '1.5rem'}}></i>
                                <div className="action-badge">{userToApproveCnt+userToReviewCnt+userToAckCnt}</div>
                            </div>
                        </div>
                        <div className="action-items">
                            {actionData.map((data, index) => (
                                <ActionItem key={index} {...data} />
                            ))}
                           
                        </div>
                    </div>
                 </div>

                {/* Quick Actions */}
                <div className="dashboard-stats">
                    <div className="dashboard-card">
                        <div className="card-header">
                            <h3>Quick Actions</h3>
                        </div>
                         <div className="quick-actions-grid">
                            {quickActions.map((action, index) => (
                                <div 
                                    key={index}
                                    className={`quick-action-card quick-action-${action.color}`}
                                    onClick={action.action}
                                >
                                   <div className="action-icon-wrapper">
                                        <i className={action.icon}></i>
                                    </div>
                                    <h3>{action.label}</h3>
                                    <div className="action-desc">{action.subText}</div>
                                </div>
                            ))}
                        </div>
                      
                    </div>  

                    {/* Notifications */}
                   <div className="dashboard-card notifications-card">
                       <NotificationList userId={userId}></NotificationList>
                    </div>
                </div>
            </div>
            <ReportDialog context={reports} onHide={() => setReports(null)} />
        </div>
    );
};

export default DashboardManual;
