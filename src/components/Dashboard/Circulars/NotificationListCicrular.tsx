import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dmsLifecycleService from '../../../services/DMSLifecycleService';

export interface NotificationProps {
    userId: string;
}

interface Notification {
    id: number;
    notificationTitle: string;
    description: string;
    type: 'info' | 'success' | 'warning' | 'error';
    createdDate: string;
    isRead: boolean;
    manualId?: number;
    manualTitle?: string;
    userId: string;
}

// userId is not needed here: the API answers for the logged-in user.
const NotificationListCicrular: React.FC<NotificationProps> = () => {
    const navigate = useNavigate();
      const [loading, setLoading] = useState(false);
      const [notifications, setNotifications] = useState<Notification[]>([]);
  
    const fetchNotifications = () => {
        setLoading(true);
        dmsLifecycleService.getApiCall<(Partial<Notification> & { cirNotificationId?: number })[] | null>(`Circular/GetCircularsNotifications?limit=10`)
            .then((data) => {
                if (data && Array.isArray(data)) {
                    // The API sends cirNotificationId; the list uses id.
                    setNotifications(data.map((n) => ({ ...n, id: (n.id ?? n.cirNotificationId) as number, isRead: !!n.isRead }) as Notification));
                } else {
                    setNotifications([]);
                }
            })
            .catch((error) => {
                console.error('Failed to fetch notifications:', error);
                setNotifications([]);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    const markAsRead = (notificationId: number) => {
        dmsLifecycleService.postApiCall(`Circular/MarkNotificationRead`, { notificationId })
        .then(() => {
            setNotifications(prev => 
                prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
            );
        })
        .catch((error) => {
            console.error('Failed to mark notification as read:', error);
        });
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'success':
                return 'pi pi-check-circle';
            case 'warning':
                return 'pi pi-exclamation-triangle';
            case 'error':
                return 'pi pi-times-circle';
            case 'info':
            default:
                return 'pi pi-info-circle';
        }
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInDays > 0) {
            return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        } else if (diffInHours > 0) {
            return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        } else {
            const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
            return `${diffInMinutes > 0 ? diffInMinutes : 1} minute${diffInMinutes > 1 ? 's' : ''} ago`;
        }
    };

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            markAsRead(notification.id);
        }
        
        if (notification.manualId) {
            navigate(`/manual/${notification.manualId}`);
        }
    };

   
    useEffect(() => {   
        fetchNotifications();
    }, []);
      
    return (
        <div>
          <div className="card-header">
              <h3>Notifications</h3>
              {loading && <i className="pi pi-spin pi-spinner"></i>}
          </div>
          <div className="notifications">
              {notifications.length === 0 && !loading ? (
                  <div className="no-notifications">
                      <i className="pi pi-info-circle"></i>
                      <span>No recent notifications</span>
                  </div>
              ) : (
                  notifications.slice(0, 5).map((notification) => (
                      <div 
                          key={notification.id} 
                          className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
                          onClick={() => handleNotificationClick(notification)}
                      >
                          <div className={`notification-icon ${notification.type}`}>
                              <i className={getNotificationIcon(notification.type)}></i>
                          </div>
                          <div className="notification-content">
                              <div className="notification-title">
                                  {notification.notificationTitle}
                                  {!notification.isRead && <span className="unread-dot"></span>}
                              </div>
                              <div className="notification-desc">
                                  {notification.description}
                                  {notification.manualTitle && (
                                      <span className="manual-title"> - {notification.manualTitle}</span>
                                  )}
                              </div>
                              <div className="notification-time">
                                  {formatTimeAgo(notification.createdDate)}
                              </div>
                          </div>
                      </div>
                  ))
              )}
              
              {notifications.length > 5 && (
                  <div className="view-all-notifications">
                      <button 
                          className="view-all-btn"
                          onClick={() => navigate('/notifications')}
                      >
                          View All Notifications ({notifications.length})
                      </button>
                  </div>
              )}
          </div>
        </div>
    );
};

export default NotificationListCicrular;