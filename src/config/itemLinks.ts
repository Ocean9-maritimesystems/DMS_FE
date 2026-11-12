/**
 * Where an item opens in the app. Used by search results and the pending-acknowledgement lists.
 *   Manual      -> Manuals page with that manual selected   (/manuals?id=123)
 *   Circular    -> Circulars page with that circular open   (/circulars?cirmode=circulars&id=123)
 *   Alert       -> Alerts page with that alert open         (/circulars?cirmode=alerts&id=123)
 *   Suggestion  -> Suggestions page                         (/suggestions?id=123)
 * Other documents have no page of their own: they open from Dashboard > Other Documents, so no link.
 */
export const itemLink = (itemType: string, itemId: number): string | null => {
    switch ((itemType || '').toLowerCase()) {
        case 'manual':
            return `/manuals?id=${itemId}`;
        case 'circular':
            return `/circulars?cirmode=circulars&id=${itemId}`;
        case 'alert':
            return `/circulars?cirmode=alerts&id=${itemId}`;
        case 'suggestion':
            return `/suggestions?id=${itemId}`;
        default:
            return null;
    }
};

/** Icon (PrimeIcons) for an item type. */
export const itemIcon = (itemType: string): string => {
    switch ((itemType || '').toLowerCase()) {
        case 'manual': return 'pi pi-book';
        case 'circular': return 'pi pi-megaphone';
        case 'alert': return 'pi pi-exclamation-triangle';
        case 'suggestion': return 'pi pi-comment';
        default: return 'pi pi-file';
    }
};
