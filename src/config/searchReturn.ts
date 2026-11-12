/**
 * "Back to search results": when a search result is opened, the search (its address and words) is remembered
 * for this browser tab, and the header offers a way back while the opened page is on screen. It is forgotten
 * once the user goes to another page from there.
 */
const KEY = 'dms.searchReturn';

export interface SearchReturn {
    /** The search page address to go back to, e.g. /search?q=pump&types=Manual */
    url: string;
    /** The words searched for (shown in the link). */
    query: string;
    /** The page the result opened (path only, e.g. /manuals): the link shows while that page is open. */
    target: string;
}

export const rememberSearch = (value: SearchReturn) => {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(value));
    } catch {
        /* storage blocked: no way back, nothing else breaks */
    }
};

export const readSearchReturn = (): SearchReturn | null => {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as SearchReturn;
        return value && typeof value.url === 'string' && value.url.startsWith('/search') ? value : null;
    } catch {
        return null;
    }
};

export const forgetSearch = () => {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        /* nothing to do */
    }
};

/** The path of a link such as /manuals?id=12 (-> /manuals), lower case. */
export const pathOf = (link: string) => link.split(/[?#]/)[0].toLowerCase();
