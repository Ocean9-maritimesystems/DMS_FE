import axios from 'axios';
import { API_URL } from '../config/appConfig';
import authService from './authService';
import dmsLifecycleService from './DMSLifecycleService';

/**
 * The new features (office API: FeatureControllers.cs): pending acknowledgements, inbox, circular extras,
 * suggestions, folders, and search.
 */

// ---- Types (match DMS.Application/Interface/IFeatureServices.cs; JSON is camelCase) ----

export interface AckPendingRow {
    vesselID: number;
    vesselName?: string;
    itemType: 'Manual' | 'Circular' | 'Alert';
    itemID: number;
    number?: string;
    title?: string;
    version?: string;
    rank?: string;
    userID?: string;
    userName?: string;
    dept?: string;
    releasedOn?: string;
    dueOn?: string;
    ackDueDays: number;
    overdue: boolean;
    daysWaiting: number;
}

export interface AckVesselSummary {
    vesselID: number;
    vesselName?: string;
    lastSyncUtc?: string;
    manualsPending: number;
    manualsOverdue: number;
    circularsPending: number;
    circularsOverdue: number;
    alertsPending: number;
    alertsOverdue: number;
}

export interface FeatureSettings {
    allowedRolesToViewAllRankPendingItems?: string;
    defaultAckDueDaysManual: number;
    defaultAckDueDaysCircular: number;
    defaultAckDueDaysAlert: number;
    folderMaxFileSizeMB: number;
    folderMaxFiles: number;
}

export interface InboxItem {
    dmS_InboxID: number;
    vesselID: number;
    itemType: string;
    itemID: number;
    versionID?: number;
    action: string;
    title?: string;
    priority?: number;
    createdOn: string;
    isRead: boolean;
}

export interface CircularManualLink {
    ciR_ManualLinkID: number;
    ciR_MasterID: number;
    circularNumber?: string;
    circularTitle?: string;
    circularType?: string;
    circularStatus?: string;
    dM_ManualID: number;
    manualNo?: string;
    manualName?: string;
    dM_ManualVersionID?: number;
    linkType: 'Amends' | 'Supersedes' | 'RefersTo';
    remarks?: string;
    isActive: boolean;
    closedOn?: string;
    createdOn?: string;
}

export interface CircularExtras {
    ciR_MasterID: number;
    status?: string;
    ackDueDays?: number | null;
    validUntil?: string | null;
    supersededByID?: number | null;
    supersededByNumber?: string;
    requiresValidUntil: boolean;
    links: CircularManualLink[];
}

export interface CircularCategorySetting {
    ciR_CategoryID: number;
    circularType?: string;
    categoryCode?: string;
    category?: string;
    requiresValidUntil: boolean;
}

export interface SuggestionListItem {
    suG_MasterID: number;
    vesselID: number;
    vesselName?: string;
    suggestionNo?: string;
    title: string;
    itemType?: string;
    itemID?: number;
    itemTitle?: string;
    priority: string;
    status: string;
    submittedBy: string;
    submittedByName?: string;
    submittedRank?: string;
    submittedOn: string;
    assignedTo?: string;
    modifiedOn?: string;
}

export interface SuggestionLog {
    suG_LogID: number;
    status?: string;
    comment?: string;
    userID?: string;
    userName?: string;
    logDate: string;
}

export interface FileItem {
    id: number;
    folderID?: number;
    fileName: string;
    fileType?: string;
    blobSize: number;
    version: number;
    uploadedBy?: string;
    uploadedByName?: string;
    uploadedOn?: string;
}

export interface SuggestionDetail extends SuggestionListItem {
    description?: string;
    quotedText?: string;
    implementedItemType?: string;
    implementedItemID?: number;
    log: SuggestionLog[];
    files: FileItem[];
}

export interface FolderItem {
    otherDocument_FolderID: number;
    vesselID: number;
    vesselName?: string;
    parentID?: number | null;
    folderName: string;
    fileCount: number;
    canEdit: boolean;
}

export interface SaveFolder {
    parentId?: number | null;
    name: string;
    /** A vessel's folder: the vessel; -1 = every vessel (administrators); none = office only. Sub-folders follow their parent. */
    vesselId?: number | null;
}

/** An Other Document as shown in a folder. */
export interface FolderDocument {
    otherDocumentMasterID: number;
    vesselID: number;
    /** Office-only document: the vessel it is about. */
    relatedVesselID?: number | null;
    vesselName?: string;
    otherDocument_FolderID?: number | null;
    folderName?: string | null;
    /** Added at the office and kept there (never sent to a vessel). */
    isOfficeOnly: boolean;
    otherDocument_TypeID?: number;
    documentType?: string;
    documentNumber?: string;
    documentTitle?: string;
    status?: string;
    reference?: string;
    comments?: string;
    uploadedOn?: string;
    uploadedBy?: string;
    origin?: string;
    fileCount: number;
    firstFileID?: number;
    expiryDate?: string;
}

export interface SearchHit {
    itemType: string;
    itemID: number;
    number?: string;
    title?: string;
    snippet?: string;
    vesselID?: number;
    date?: string;
}

export interface VesselOption {
    vesselID: number;
    vslName: string;
}

// ---- Helpers ----

const q = (params: Record<string, string | number | boolean | null | undefined>) => {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return parts.length ? `?${parts.join('&')}` : '';
};

/** multipart/form-data upload with the login token. */
const postForm = async (endpoint: string, form: FormData) => {
    const token = authService.token();
    const { data } = await axios.post(`${API_URL}/${endpoint}`, form, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 15 * 60_000,
    });
    return data;
};

/** Downloads a file from the API (with the token) and opens it in a new tab, or saves it. */
export const openApiFile = async (endpoint: string, fileName?: string, save = false) => {
    const token = authService.token();
    const response = await axios.get(`${API_URL}/${endpoint}`, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 15 * 60_000,
    });
    const url = URL.createObjectURL(response.data as Blob);
    const viewable = /\.(pdf|png|jpe?g|gif|txt|html?)$/i.test(fileName ?? '');
    if (save || !viewable) {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } else {
        window.open(url, '_blank', 'noopener');
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

/** Where an item opens in the office app. */
export const itemLink = (itemType: string, itemId: number): { pathname: string; search?: string; state?: any } => {
    switch (itemType) {
        case 'Manual':
            return { pathname: '/manuals', search: `?id=${itemId}` };
        case 'Circular':
            return { pathname: '/circulars', search: `?cirmode=allCirculars&id=${itemId}` };
        case 'Alert':
            return { pathname: '/circulars', search: `?cirmode=allAlerts&id=${itemId}` };
        case 'Suggestion':
            return { pathname: '/suggestions', search: `?id=${itemId}` };
        default:
            return { pathname: '/otherdocuments' };
    }
};

export const ITEM_ICONS: Record<string, string> = {
    Manual: 'pi pi-book',
    Circular: 'pi pi-megaphone',
    Alert: 'pi pi-exclamation-triangle',
    Document: 'pi pi-file',
    Suggestion: 'pi pi-comments',
};

// ---- API ----

const api = dmsLifecycleService;

const featureApi = {
    vessels: async (): Promise<VesselOption[]> => {
        const data = await api.getApiCall('Vessel/GetVessels');
        return (data || []).map((v: any) => ({ vesselID: v.vesselID ?? v.vesselId, vslName: v.vslName ?? v.vesselName ?? v.name ?? String(v.vesselID ?? v.vesselId) }));
    },

    pending: {
        vessels: (): Promise<AckVesselSummary[]> => api.getApiCall('Pending/Vessels'),
        vessel: (vesselId?: number | null, itemType?: string | null, rank?: string | null): Promise<AckPendingRow[]> =>
            api.getApiCall(`Pending/Vessel${q({ vesselId, itemType, rank })}`),
        office: (userId?: string | null): Promise<AckPendingRow[]> => api.getApiCall(`Pending/Office${q({ userId })}`),
        settings: (): Promise<FeatureSettings> => api.getApiCall('Pending/Settings'),
        saveSettings: (s: FeatureSettings) => api.putApiCall('Pending/Settings', s),
    },

    inbox: {
        list: (unreadOnly: boolean, itemType?: string | null, search?: string | null, take = 300): Promise<InboxItem[]> =>
            api.getApiCall(`Inbox${q({ unreadOnly, itemType, search, take })}`),
        unreadCount: async (): Promise<number> => (await api.getApiCall('Inbox/UnreadCount'))?.count ?? 0,
        markRead: (id: number, read = true) => api.postApiCall(`Inbox/${id}/Read?read=${read}`),
        markAllRead: () => api.postApiCall('Inbox/ReadAll'),
    },

    circular: {
        get: (id: number): Promise<CircularExtras> => api.getApiCall(`Circular/${id}/Extras`),
        save: (id: number, ackDueDays: number | null, validUntil: string | null) =>
            api.putApiCall(`Circular/${id}/Extras`, { ackDueDays, validUntil }),
        addLink: (id: number, manualId: number, linkType: string, remarks?: string, manualVersionId?: number | null) =>
            api.postApiCall(`Circular/${id}/Links`, { manualId, manualVersionId: manualVersionId ?? null, linkType, remarks: remarks || null }),
        removeLink: (linkId: number) => api.deleteApiCall(`Circular/Links/${linkId}`),
        cancel: (id: number, supersededById: number | null, reason: string) =>
            api.postApiCall(`Circular/${id}/Cancel`, { supersededById, reason }),
        /** Draft -> Active: the circular goes to the vessels. */
        release: (id: number) => api.postApiCall(`Circular/${id}/Release`, {}),
        forManual: (manualId: number): Promise<CircularManualLink[]> => api.getApiCall(`Circular/Manual/${manualId}/Circulars`),
        closeLinks: (manualId: number) => api.postApiCall(`Circular/Manual/${manualId}/CloseLinks`),
        manual: (manualId: number): Promise<{ dM_ManualID: number; ackDueDays?: number | null }> =>
            api.getApiCall(`Circular/Manual/${manualId}/Extras`),
        saveManual: (manualId: number, ackDueDays: number | null) =>
            api.putApiCall(`Circular/Manual/${manualId}/Extras`, { dM_ManualID: manualId, ackDueDays }),
        categories: (): Promise<CircularCategorySetting[]> => api.getApiCall('Circular/CategorySettings'),
        saveCategory: (c: CircularCategorySetting) => api.putApiCall(`Circular/CategorySettings/${c.ciR_CategoryID}`, c),
    },

    suggestions: {
        list: (status?: string | null, vesselId?: number | null, mine = false): Promise<SuggestionListItem[]> =>
            api.getApiCall(`Suggestions${q({ status, vesselId, mine })}`),
        get: (id: number): Promise<SuggestionDetail> => api.getApiCall(`Suggestions/${id}`),
        create: (form: FormData): Promise<{ id: number }> => postForm('Suggestions', form),
        setStatus: (id: number, status: string, comment?: string, implementedItemType?: string | null, implementedItemId?: number | null) =>
            api.putApiCall(`Suggestions/${id}/Status`, { status, comment: comment || null, implementedItemType: implementedItemType ?? null, implementedItemId: implementedItemId ?? null }),
        comment: (id: number, comment: string) => api.postApiCall(`Suggestions/${id}/Comment`, { comment }),
        fileUrl: (blobId: number) => `Suggestions/File/${blobId}`,
    },

    /** Folders of Other Documents (api/OtherDocument/...). A folder holds Other Documents only. */
    folders: {
        tree: (): Promise<FolderItem[]> => api.getApiCall('OtherDocument/Folders'),
        create: (f: SaveFolder): Promise<{ id: number }> => api.postApiCall('OtherDocument/Folders', f),
        update: (id: number, f: SaveFolder) => api.putApiCall(`OtherDocument/Folders/${id}`, f),
        remove: (id: number) => api.deleteApiCall(`OtherDocument/Folders/${id}`),
        /** folderId null = documents not in a folder. */
        documents: (folderId: number | null, vesselId?: number | null): Promise<FolderDocument[]> =>
            api.getApiCall(`OtherDocument/Folders/${folderId == null ? 'Unfiled' : folderId}/Documents${q({ vesselId })}`),
        /** A new office-only document; folderId null = not in a folder. */
        createDocument: (folderId: number | null, form: FormData): Promise<{ id: number }> =>
            postForm(`OtherDocument/Folders/${folderId == null ? 'Unfiled' : folderId}/Documents`, form),
        /** Every document under a vessel (any folder or none). */
        vesselDocuments: (vesselId: number): Promise<FolderDocument[]> => api.getApiCall(`OtherDocument/Vessel/${vesselId}/Documents`),
        deleteDocument: (documentId: number) => api.deleteApiCall(`OtherDocument/Documents/${documentId}`),
        moveDocument: (documentId: number, folderId: number | null) => api.putApiCall(`OtherDocument/Documents/${documentId}/Folder`, { folderId }),
        documentFiles: (documentId: number): Promise<FileItem[]> => api.getApiCall(`OtherDocument/Documents/${documentId}/Files`),
        /** An Other Document file (OtherDocument_Blob). */
        documentFileUrl: (blobId: number) => `OtherDocument/Files/${blobId}`,
    },

    search: (query: string, types?: string | null): Promise<SearchHit[]> => api.getApiCall(`Search${q({ q: query, types })}`),
};

export default featureApi;
