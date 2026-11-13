import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { writeFileSync } from 'node:fs';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const localAgo = (h: number) => { const d = new Date(Date.now() - h * 3600_000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };

const data: Record<string, unknown> = {
    'Manuals/GetDashboardManualCounts': { newCnt: 40, toApproveCnt: 9, releasedCnt: 8, toAckCnt: 5, userToApproveCnt: 0, userToReviewCnt: 0, userToAckCnt: 5, favouriteCnt: 5 },
    'Circular/GetDashboardCircularCounts': { totalCirculars: 64, totalAlerts: 12 },
    'Vessel/GetSyncMonitor': { syncInstalled: true, onlineMinutes: 15, vessels: [
        { vesselID: 1, vslName: 'Test Vessel 1', link: 'Online', lastSuccessUtc: hoursAgo(0.2), lastStatus: 'Ok', acksPending: 7, alertsPending: 2, hasKey: true },
        { vesselID: 2, vslName: 'Test Vessel 2', link: 'Offline', lastSuccessUtc: hoursAgo(53), lastStatus: 'Ok', acksPending: 12, alertsPending: 0, hasKey: true },
        { vesselID: 3, vslName: 'MV Ocean Star', link: 'Offline', lastSuccessUtc: hoursAgo(3), lastStatus: 'Failed', acksPending: 3, alertsPending: 1, hasKey: true },
        { vesselID: 4, vslName: 'MV Coral Bay', link: 'Not connected', acksPending: 0, alertsPending: 0, hasKey: false },
        { vesselID: 5, vslName: 'MV Northern Light', link: 'Online', lastSuccessUtc: hoursAgo(1), lastStatus: 'Ok', acksPending: 1, alertsPending: 0, hasKey: true },
    ] },
    'Circular/GetExpiringSoon': [
        { id: 11, number: 'ALT-SAF-2026-0004', title: 'Hurricane season precautions – Gulf of Mexico', type: 'Alert', validUntil: '2026-11-15', daysLeft: 2 },
        { id: 12, number: 'CIR-OPS-2026-0031', title: 'Revised bunkering checklist', type: 'Circular', validUntil: '2026-11-27', daysLeft: 14 },
    ],
    'Manuals/GetManualNotifications': [
        { manualNotificationId: 1, notificationTitle: 'New Manual Added', manualName: 'Precautions Prior to Standby for Departure', createdDate: localAgo(21), isRead: 0, dM_ManualID: 5 },
        { manualNotificationId: 2, notificationTitle: 'New Manual Added', manualName: 'Warming Through', createdDate: localAgo(22), isRead: 1, dM_ManualID: 6 },
    ],
    'Circular/GetCircularsNotifications': [
        { cirNotificationId: 3, notificationTitle: 'Circular released', description: 'CIR-OPS-2026-0031 Revised bunkering checklist', createdDate: localAgo(2), isRead: 0, ciR_MasterID: 12, circularType: 'Circulars' },
        { cirNotificationId: 4, notificationTitle: 'Alert released', description: 'ALT-SAF-2026-0004 Hurricane season precautions', createdDate: localAgo(30), isRead: 1, ciR_MasterID: 11, circularType: 'Alerts' },
    ],
};

vi.mock('../../../services/DMSLifecycleService', () => ({
    default: {
        getApiCall: (url: string) => {
            const key = Object.keys(data).find((k) => url.startsWith(k));
            return key ? Promise.resolve(data[key]) : Promise.reject(new Error(url));
        },
        postApiCall: () => Promise.resolve(null),
    },
}));
vi.mock('../../Reports/ReportDialog', () => ({ default: () => null }));

import DashboardOverview from './DashboardOverview';

describe('DashboardOverview', () => {
    it('shows the figures, leaves out empty "waiting" rows and lists vessels needing attention', async () => {
        const { container } = render(<MemoryRouter><DashboardOverview userId="u1" /></MemoryRouter>);
        await waitFor(() => expect(screen.getAllByText('Test Vessel 2').length).toBe(2));
        expect(screen.getByText('5 manuals to acknowledge')).toBeTruthy();
        expect(screen.queryByText(/to approve$/)).toBeNull();
        expect(screen.getByText('57 manuals')).toBeTruthy(); // 40 + 9 + 8
        expect(screen.getByText('Last sync failed')).toBeTruthy();
        expect(screen.getByText('Never synced')).toBeTruthy();
        expect(screen.queryByText('MV Northern Light', { selector: '.dov-row__title' })).toBeNull();
        expect(screen.getByText('2 days')).toBeTruthy();
        // each section has its own activity: circulars and alerts apart from manuals, newest first, each labelled
        const titles = (id: string) => Array.from(container.querySelector(`#${id}`)!.closest('section')!.querySelectorAll('.dov-row__title')).map((e) => e.textContent);
        expect(titles('dov-cact')).toEqual(['CircularCircular released', 'AlertAlert released']);
        expect(titles('dov-mact')).toEqual(['New Manual Added', 'New Manual Added']);
        expect(container.querySelectorAll('.dov-section').length).toBe(3);
        if (process.env.DOV_DUMP) writeFileSync(process.env.DOV_DUMP, container.innerHTML);
    });
});
