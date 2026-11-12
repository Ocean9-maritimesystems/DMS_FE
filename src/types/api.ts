/**
 * Shapes of the API responses used by the newer screens (the API sends camelCase JSON).
 * Kept in one place so a change on the API side shows up as a type error here.
 */

/** GET api/Search?q=&types= (DMS.Application.DTO.Features.SearchHit). */
export interface SearchHit {
    /** Manual | Circular | Alert | Document |  Suggestion */
    itemType: string;
    itemID: number;
    number?: string | null;
    title?: string | null;
    snippet?: string | null;
    vesselID?: number | null;
    date?: string | null;
}

/** One person (or vessel rank) who still has to acknowledge an item (api/Pending/...). */
export interface AckPendingRow {
    /** -1 for office users. */
    vesselID: number;
    vesselName?: string | null;
    /** Manual | Circular | Alert */
    itemType: string;
    itemID: number;
    number?: string | null;
    title?: string | null;
    version?: string | null;
    /** Vessel rank, or office role. */
    rank?: string | null;
    userID?: string | null;
    userName?: string | null;
    dept?: string | null;
    releasedOn?: string | null;
    dueOn?: string | null;
    ackDueDays: number;
    overdue: boolean;
    daysWaiting: number;
}

/** GET api/Pending/Vessels: one row per vessel. */
export interface AckVesselSummary {
    vesselID: number;
    vesselName?: string | null;
    lastSyncUtc?: string | null;
    manualsPending: number;
    manualsOverdue: number;
    circularsPending: number;
    circularsOverdue: number;
    alertsPending: number;
    alertsOverdue: number;
}

/** GET/PUT api/Pending/Settings (PUT: administrators only). */
export interface FeatureSettings {
    allowedRolesToViewAllRankPendingItems?: string | null;
    defaultAckDueDaysManual: number;
    defaultAckDueDaysCircular: number;
    defaultAckDueDaysAlert: number;
    folderMaxFileSizeMB: number;
    folderMaxFiles: number;
}
