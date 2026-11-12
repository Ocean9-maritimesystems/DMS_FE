import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dmsLifecycleService from '../../../services/DMSLifecycleService';

export interface RecentCircularsListProps {
    userId: string;
    circularType: 'circulars' | 'alerts';
    limit?: number;
}

interface Circular {
    ciR_MasterID: number;
    category: string;
    ciR_Number: string;
    title: string;
    statusString: 'Active' | 'Archived' | 'Draft';
    priority: 'High' | 'Medium' | 'Low';
    dateIssued: string;
}

const RecentCircularsList: React.FC<RecentCircularsListProps> = ({ userId, circularType, limit = 5 }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [circulars, setCirculars] = useState<Circular[]>([]);

    const fetchRecentCirculars = useCallback(() => {
        setLoading(true);
        dmsLifecycleService.getApiCall<Circular[] | null>(`Circular/GetRecentCirculars?circularType=${circularType}&limit=${limit}`)
            .then((data) => {
                if (data && Array.isArray(data)) {
                    setCirculars(data);
                } else {
                    setCirculars([]);
                }
            })
            .catch((error) => {
                console.error('Failed to fetch recent circulars:', error);
                setCirculars([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [circularType, limit]);

    const getPriorityClass = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'high':
                return 'priority-high';
            case 'medium':
                return 'priority-medium';
            case 'low':
                return 'priority-low';
            default:
                return 'priority-medium';
        }
    };

    const getPriorityIcon = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'high':
                return 'pi pi-exclamation-circle';
            case 'medium':
                return 'pi pi-info-circle';
            case 'low':
                return 'pi pi-minus-circle';
            default:
                return 'pi pi-info-circle';
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTimeAgo = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInDays > 7) {
            return formatDate(dateString);
        } else if (diffInDays > 0) {
            return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        } else if (diffInHours > 0) {
            return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        } else {
            const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
            return `${diffInMinutes > 0 ? diffInMinutes : 1} minute${diffInMinutes > 1 ? 's' : ''} ago`;
        }
    };

    const handleViewAll = () => {
        const mode = circularType === 'circulars' ? 'circulars' : 'alerts';
        navigate(`/circulars?cirmode=${mode}`);
    };

    // Reloaded for another user, type or count (userId: the list is the logged-in user's).
    useEffect(() => {
        fetchRecentCirculars();
    }, [fetchRecentCirculars, userId]);

    return (
        <div className="recent-circulars-container">
            <div className="card-header">
                <h3>
                    <i className={circularType === 'circulars' ? 'pi pi-inbox' : 'pi pi-bell'}></i>
                    Recent {circularType === 'circulars' ? 'Circulars' : 'Alerts'}
                </h3>
                {loading && <i className="pi pi-spin pi-spinner"></i>}
            </div>
            <div className="recent-circulars-list">
                {circulars.length === 0 && !loading ? (
                    <div className="no-circulars">
                        <i className="pi pi-info-circle"></i>
                        <span>No recent {circularType}</span>
                    </div>
                ) : (
                    circulars.map((circular) => (
                        <div
                            key={circular.ciR_MasterID}
                            className="circular-item"
                            // onClick={() => handleCircularClick(circular)}
                        >
                            <div className="circular-main">
                                <div className={`circular-priority ${getPriorityClass(circular.priority)}`}>
                                    <i className={getPriorityIcon(circular.priority)}></i>
                                </div>
                                <div className="circular-content">
                                    <div className="circular-header-row">
                                        <div className="circular-number">
                                            {circular.ciR_Number}
                                        </div>
                                        <div className="circular-date">
                                            <i className="pi pi-calendar"></i>
                                            {formatTimeAgo(circular.dateIssued)}
                                        </div>
                                        <div className="circular-category">
                                            {circular.category}
                                        </div>
                                    </div>
                                    <div className="circular-title">
                                        {circular.title}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {circulars.length > 0 && (
                    <div className="view-all-circulars">
                        <button
                            className="view-all-btn"
                            onClick={handleViewAll}
                        >
                            View All {circularType === 'circulars' ? 'Circulars' : 'Alerts'}
                            <i className="pi pi-arrow-right"></i>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecentCircularsList;
