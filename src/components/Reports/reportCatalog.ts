/**
 * The office reports: what each one shows and which filters it offers. The rows come from GET api/Reports/{key}
 * (ReportService.cs on the API); the columns below pick and format the fields of those rows.
 */

export type ColumnType = 'text' | 'date' | 'datetime' | 'number' | 'tag';

export interface ReportColumn {
    field: string;
    header: string;
    type?: ColumnType;
    /** Relative width in the PDF and Excel export (default 1). */
    weight?: number;
}

export type ReportFilterKey = 'vessel' | 'itemType' | 'status' | 'dateRange' | 'overdueOnly' | 'days' | 'topLevelOnly';

export interface Option { label: string; value: string }

export interface ReportDefinition {
    key: string;
    group: string;
    title: string;
    description: string;
    icon: string;
    columns: ReportColumn[];
    filters: ReportFilterKey[];
    /** The vessel list also offers "Office" (-1). */
    vesselWithOffice?: boolean;
    itemTypes?: Option[] | 'documentTypes';
    itemTypeLabel?: string;
    statuses?: Option[];
    statusLabel?: string;
    dateLabel?: string;
    daysLabel?: string;
    /** Values preset when the report is opened. */
    defaults?: Partial<{ overdueOnly: boolean; topLevelOnly: boolean; days: number }>;
    /** PDF page orientation (wide reports are landscape). */
    landscape?: boolean;
}

const opts = (...values: string[]): Option[] => values.map((v) => ({ label: v, value: v }));

const ACK_TYPES = opts('Manual', 'Circular', 'Alert');

export const REPORTS: ReportDefinition[] = [
    // ------------------------------------------------------------------ Acknowledgements
    {
        key: 'ack-pending',
        group: 'Acknowledgements',
        title: 'Pending acknowledgements',
        description: 'Crew who still have to acknowledge a manual, circular or alert, with due date and days waiting.',
        icon: 'pi pi-clock',
        filters: ['vessel', 'itemType', 'status', 'overdueOnly'],
        itemTypes: ACK_TYPES,
        statusLabel: 'Rank',
        landscape: true,
        columns: [
            { field: 'vessel', header: 'Vessel', weight: 1.2 },
            { field: 'type', header: 'Type', type: 'tag', weight: 0.8 },
            { field: 'number', header: 'Number' },
            { field: 'title', header: 'Title', weight: 2.2 },
            { field: 'version', header: 'Version', weight: 0.6 },
            { field: 'rank', header: 'Rank' },
            { field: 'name', header: 'Crew member', weight: 1.3 },
            { field: 'released', header: 'Released', type: 'date' },
            { field: 'due', header: 'Due', type: 'date' },
            { field: 'daysWaiting', header: 'Days waiting', type: 'number', weight: 0.7 },
            { field: 'overdue', header: 'Overdue', type: 'tag', weight: 0.6 },
        ],
    },
    {
        key: 'ack-vessel-summary',
        group: 'Acknowledgements',
        title: 'Acknowledgements by vessel',
        description: 'Pending and overdue acknowledgements per vessel, with the last successful sync.',
        icon: 'pi pi-chart-bar',
        filters: ['vessel'],
        landscape: true,
        columns: [
            { field: 'vessel', header: 'Vessel', weight: 1.5 },
            { field: 'lastSync', header: 'Last sync (UTC)', type: 'datetime', weight: 1.3 },
            { field: 'manualsPending', header: 'Manuals pending', type: 'number' },
            { field: 'manualsOverdue', header: 'Manuals overdue', type: 'number' },
            { field: 'circularsPending', header: 'Circulars pending', type: 'number' },
            { field: 'circularsOverdue', header: 'Circulars overdue', type: 'number' },
            { field: 'alertsPending', header: 'Alerts pending', type: 'number' },
            { field: 'alertsOverdue', header: 'Alerts overdue', type: 'number' },
            { field: 'totalPending', header: 'Total pending', type: 'number' },
            { field: 'totalOverdue', header: 'Total overdue', type: 'number' },
        ],
    },
    {
        key: 'ack-office',
        group: 'Acknowledgements',
        title: 'Office pending acknowledgements',
        description: 'Office users who still have to acknowledge a manual, circular or alert.',
        icon: 'pi pi-building',
        filters: ['itemType', 'overdueOnly'],
        itemTypes: ACK_TYPES,
        landscape: true,
        columns: [
            { field: 'type', header: 'Type', type: 'tag', weight: 0.8 },
            { field: 'number', header: 'Number' },
            { field: 'title', header: 'Title', weight: 2.2 },
            { field: 'version', header: 'Version', weight: 0.6 },
            { field: 'name', header: 'User', weight: 1.3 },
            { field: 'role', header: 'Role' },
            { field: 'dept', header: 'Department' },
            { field: 'released', header: 'Released', type: 'date' },
            { field: 'due', header: 'Due', type: 'date' },
            { field: 'daysWaiting', header: 'Days waiting', type: 'number', weight: 0.7 },
            { field: 'overdue', header: 'Overdue', type: 'tag', weight: 0.6 },
        ],
    },
    {
        key: 'ack-completed',
        group: 'Acknowledgements',
        title: 'Acknowledgements received',
        description: 'Who acknowledged what and when, on board and at the office.',
        icon: 'pi pi-check-circle',
        filters: ['vessel', 'itemType', 'dateRange'],
        vesselWithOffice: true,
        itemTypes: ACK_TYPES,
        dateLabel: 'Acknowledged',
        landscape: true,
        columns: [
            { field: 'vessel', header: 'Vessel', weight: 1.2 },
            { field: 'type', header: 'Type', type: 'tag', weight: 0.8 },
            { field: 'number', header: 'Number' },
            { field: 'title', header: 'Title', weight: 2.2 },
            { field: 'version', header: 'Version', weight: 0.6 },
            { field: 'name', header: 'Name', weight: 1.3 },
            { field: 'rank', header: 'Rank / role' },
            { field: 'acknowledgedOn', header: 'Acknowledged on', type: 'datetime', weight: 1.2 },
            { field: 'comments', header: 'Comments', weight: 1.5 },
        ],
    },

    // ------------------------------------------------------------------ Circulars & alerts
    {
        key: 'circular-register',
        group: 'Circulars & alerts',
        title: 'Circulars & alerts register',
        description: 'Every circular and alert with status, dates and how many acknowledgements are in or still due.',
        icon: 'pi pi-megaphone',
        filters: ['itemType', 'status', 'dateRange'],
        itemTypes: opts('Circular', 'Alert'),
        statuses: opts('Draft', 'Active', 'Cancelled'),
        dateLabel: 'Issued',
        landscape: true,
        columns: [
            { field: 'type', header: 'Type', type: 'tag', weight: 0.8 },
            { field: 'number', header: 'Number', weight: 1.2 },
            { field: 'category', header: 'Category' },
            { field: 'title', header: 'Title', weight: 2.2 },
            { field: 'reference', header: 'Reference' },
            { field: 'priority', header: 'Priority', weight: 0.7 },
            { field: 'status', header: 'Status', type: 'tag', weight: 0.8 },
            { field: 'issued', header: 'Issued', type: 'date' },
            { field: 'released', header: 'Released', type: 'date' },
            { field: 'validUntil', header: 'Valid until', type: 'date' },
            { field: 'supersededBy', header: 'Superseded by' },
            { field: 'acksReceived', header: 'Acks in', type: 'number', weight: 0.6 },
            { field: 'acksPending', header: 'Acks due', type: 'number', weight: 0.6 },
            { field: 'acksOverdue', header: 'Overdue', type: 'number', weight: 0.6 },
        ],
    },

    // ------------------------------------------------------------------ Documents
    {
        key: 'document-register',
        group: 'Documents',
        title: 'Other documents register',
        description: 'Other documents per vessel: where they came from, their folder and number of files.',
        icon: 'pi pi-folder-open',
        filters: ['vessel', 'itemType', 'status', 'dateRange'],
        itemTypes: 'documentTypes',
        itemTypeLabel: 'Document type',
        statuses: opts('Office only', 'Sent to vessel', 'From vessel'),
        statusLabel: 'Source',
        dateLabel: 'Added',
        landscape: true,
        columns: [
            { field: 'vessel', header: 'Vessel', weight: 1.2 },
            { field: 'type', header: 'Type', weight: 1.3 },
            { field: 'number', header: 'Number' },
            { field: 'title', header: 'Title', weight: 2.2 },
            { field: 'status', header: 'Status', weight: 0.8 },
            { field: 'source', header: 'Source', type: 'tag' },
            { field: 'folder', header: 'Folder' },
            { field: 'files', header: 'Files', type: 'number', weight: 0.5 },
            { field: 'addedOn', header: 'Added', type: 'date' },
            { field: 'addedBy', header: 'Added by' },
        ],
    },

    // ------------------------------------------------------------------ Manuals, sync & suggestions
    {
        key: 'manual-register',
        group: 'Manuals, sync & suggestions',
        title: 'Manuals register',
        description: 'Manuals with category, status, current version and acknowledgement settings.',
        icon: 'pi pi-book',
        filters: ['topLevelOnly'],
        defaults: { topLevelOnly: true },
        landscape: true,
        columns: [
            { field: 'category', header: 'Category', weight: 1.2 },
            { field: 'number', header: 'Manual no.' },
            { field: 'title', header: 'Name', weight: 2.2 },
            { field: 'level', header: 'Level', type: 'number', weight: 0.5 },
            { field: 'status', header: 'Status', type: 'tag', weight: 0.9 },
            { field: 'version', header: 'Version', weight: 0.6 },
            { field: 'versions', header: 'Versions', type: 'number', weight: 0.6 },
            { field: 'published', header: 'Published', type: 'date' },
            { field: 'released', header: 'Released', type: 'date' },
            { field: 'ackRequired', header: 'Ack required', weight: 0.7 },
            { field: 'ackDueDays', header: 'Ack due days', type: 'number', weight: 0.7 },
            { field: 'lastChanged', header: 'Last changed', type: 'date' },
        ],
    },
    {
        key: 'vessel-sync',
        group: 'Manuals, sync & suggestions',
        title: 'Vessel sync status',
        description: 'When each vessel last contacted the office and synced, and anything waiting on board.',
        icon: 'pi pi-sync',
        filters: ['vessel'],
        landscape: true,
        columns: [
            { field: 'vessel', header: 'Vessel', weight: 1.4 },
            { field: 'code', header: 'Code', weight: 0.6 },
            { field: 'lastContact', header: 'Last contact (UTC)', type: 'datetime', weight: 1.2 },
            { field: 'lastSuccess', header: 'Last sync (UTC)', type: 'datetime', weight: 1.2 },
            { field: 'lastPull', header: 'Last download (UTC)', type: 'datetime', weight: 1.2 },
            { field: 'lastPush', header: 'Last upload (UTC)', type: 'datetime', weight: 1.2 },
            { field: 'daysSinceSync', header: 'Days since sync', type: 'number', weight: 0.7 },
            { field: 'status', header: 'Status', type: 'tag', weight: 0.8 },
            { field: 'pendingOnShip', header: 'Waiting on board', type: 'number', weight: 0.7 },
            { field: 'appVersion', header: 'App version', weight: 0.7 },
            { field: 'lastError', header: 'Last error', weight: 1.6 },
        ],
    },
    {
        key: 'sync-log',
        group: 'Vessel sync',
        title: 'Sync history',
        description: 'Every download and upload between the office and the vessels, with duration and errors.',
        icon: 'pi pi-history',
        filters: ['vessel', 'status', 'dateRange'],
        statuses: opts('OK', 'Failed'),
        dateLabel: 'Started',
        landscape: true,
        columns: [
            { field: 'vessel', header: 'Vessel', weight: 1.3 },
            { field: 'direction', header: 'Direction', weight: 0.7 },
            { field: 'started', header: 'Started (UTC)', type: 'datetime', weight: 1.2 },
            { field: 'finished', header: 'Finished (UTC)', type: 'datetime', weight: 1.2 },
            { field: 'seconds', header: 'Seconds', type: 'number', weight: 0.6 },
            { field: 'items', header: 'Items', type: 'number', weight: 0.6 },
            { field: 'status', header: 'Status', type: 'tag', weight: 0.7 },
            { field: 'error', header: 'Error', weight: 2 },
        ],
    },
    {
        key: 'suggestions',
        group: 'Manuals, sync & suggestions',
        title: 'Suggestions',
        description: 'Suggestions from the vessels and the office, with status, priority and what they are about.',
        icon: 'pi pi-comments',
        filters: ['vessel', 'status', 'dateRange'],
        vesselWithOffice: true,
        statuses: [
            { label: 'Submitted', value: 'Submitted' },
            { label: 'Under review', value: 'UnderReview' },
            { label: 'Needs info', value: 'NeedsInfo' },
            { label: 'Accepted', value: 'Accepted' },
            { label: 'Rejected', value: 'Rejected' },
            { label: 'Implemented', value: 'Implemented' },
            { label: 'Closed', value: 'Closed' },
        ],
        dateLabel: 'Submitted',
        landscape: true,
        columns: [
            { field: 'number', header: 'Number' },
            { field: 'title', header: 'Title', weight: 2 },
            { field: 'vessel', header: 'Vessel', weight: 1.2 },
            { field: 'submittedBy', header: 'Submitted by', weight: 1.2 },
            { field: 'rank', header: 'Rank' },
            { field: 'submittedOn', header: 'Submitted', type: 'date' },
            { field: 'priority', header: 'Priority', weight: 0.7 },
            { field: 'status', header: 'Status', type: 'tag' },
            { field: 'about', header: 'About', weight: 1.6 },
            { field: 'assignedTo', header: 'Assigned to' },
            { field: 'lastUpdate', header: 'Last update', type: 'date' },
            { field: 'daysOpen', header: 'Days since', type: 'number', weight: 0.6 },
        ],
    },
];

export const reportByKey = (key: string | null | undefined) => REPORTS.find((r) => r.key === key) ?? null;

// ------------------------------------------------------------------ Where the reports open
// There is no Reports page: each area opens the reports that belong to it.
//   Manuals dashboard     "Reports" quick action          -> manuals
//   Circulars dashboard   "View circulars / alerts report" -> circulars / alerts
//   Other documents       "All vessels" in the vessel list -> documents
//   Vessel sync page      "Sync history" tab              -> sync-log (opened directly)

export type ReportContextKey = 'manuals' | 'circulars' | 'alerts' | 'documents';

/** One report as offered in an area: optional preset filters and a narrower list of item types. */
export interface ContextReport {
    key: string;
    /** Title in this area's list (default: the report's own title). */
    title?: string;
    /** Filters set when the report opens (and on Reset). */
    preset?: Partial<{ vesselId: number | null; itemType: string | null; status: string | null; overdueOnly: boolean; topLevelOnly: boolean; days: number | null }>;
    /** Item types offered in this area. With a single one the type filter is hidden and the report is limited to it. */
    itemTypes?: Option[];
    /** Only rows whose field has one of these values (for reports the API does not filter that way). */
    rowFilter?: { field: string; values: string[] };
}

export interface ReportContext {
    title: string;
    icon: string;
    reports: ContextReport[];
}

const ack = (type: string, plural: string): ContextReport[] => [
    { key: 'ack-pending', title: `Pending acknowledgements (vessels)`, preset: { itemType: type }, itemTypes: opts(type) },
    { key: 'ack-office', title: `Pending acknowledgements (office)`, preset: { itemType: type }, itemTypes: opts(type) },
    { key: 'ack-completed', title: `Acknowledgements received`, preset: { itemType: type }, itemTypes: opts(type) },
    { key: 'ack-vessel-summary', title: `Acknowledgements by vessel` },
    { key: 'suggestions', title: `Suggestions on ${plural}`, rowFilter: { field: 'aboutType', values: [type] } },
];

export const REPORT_CONTEXTS: Record<ReportContextKey, ReportContext> = {
    manuals: {
        title: 'Manual reports',
        icon: 'pi pi-book',
        reports: [{ key: 'manual-register' }, ...ack('Manual', 'manuals')],
    },
    circulars: {
        title: 'Circular reports',
        icon: 'pi pi-envelope',
        reports: [
            { key: 'circular-register', title: 'Circulars register', preset: { itemType: 'Circular' }, itemTypes: opts('Circular') },
            ...ack('Circular', 'circulars'),
        ],
    },
    alerts: {
        title: 'Alert reports',
        icon: 'pi pi-bell',
        reports: [
            { key: 'circular-register', title: 'Alerts register', preset: { itemType: 'Alert' }, itemTypes: opts('Alert') },
            ...ack('Alert', 'alerts'),
        ],
    },
    documents: {
        title: 'All vessels',
        icon: 'pi pi-globe',
        reports: [{ key: 'document-register' }],
    },
};
