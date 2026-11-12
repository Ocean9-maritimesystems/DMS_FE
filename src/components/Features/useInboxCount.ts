import { useEffect, useState } from 'react';
import featureApi from '../../services/featureApi';

/** Unread inbox count for the header badge: refreshed every 2 minutes and whenever the inbox changes. */
const listeners = new Set<() => void>();

export const notifyInboxChanged = () => listeners.forEach((l) => l());

export const useInboxCount = (): number => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let alive = true;
        const load = () => {
            featureApi.inbox.unreadCount()
                .then((n) => { if (alive) setCount(n); })
                .catch(() => { /* the badge is optional: no error for it */ });
        };
        load();
        const timer = window.setInterval(load, 120_000);
        listeners.add(load);
        return () => {
            alive = false;
            window.clearInterval(timer);
            listeners.delete(load);
        };
    }, []);

    return count;
};
