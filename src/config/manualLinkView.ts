import { useEffect, useState } from 'react';

/**
 * Setting: what the manual links (New documents, My favourites, Pending my approval …) open.
 *   'tree'  the Manuals tree shows only the matching manuals (parents greyed out)
 *   'grid'  the matching manuals show as a list in place of the tree
 *
 * Default for everyone: REACT_APP_MANUAL_LINK_VIEW in .env (tree | grid, default tree).
 * Each user can change it under Settings (gear icon in the header); their choice is kept in this browser.
 */
export type ManualLinkView = 'tree' | 'grid';

const STORAGE_KEY = 'manual-link-view';
const CHANGED_EVENT = 'manual-link-view-changed';

export const DEFAULT_MANUAL_LINK_VIEW: ManualLinkView =
    (import.meta.env.REACT_APP_MANUAL_LINK_VIEW || '').toLowerCase() === 'grid' ? 'grid' : 'tree';

export const MANUAL_LINK_VIEW_OPTIONS: { label: string; value: ManualLinkView }[] = [
    { label: 'Filtered tree', value: 'tree' },
    { label: 'List grid', value: 'grid' },
];

export function getManualLinkView(): ManualLinkView {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'tree' || saved === 'grid') return saved;
    } catch {
        /* storage blocked: use the default */
    }
    return DEFAULT_MANUAL_LINK_VIEW;
}

export function setManualLinkView(view: ManualLinkView): void {
    try {
        localStorage.setItem(STORAGE_KEY, view);
    } catch {
        /* storage blocked: the change still applies until the page is reloaded */
    }
    window.dispatchEvent(new CustomEvent<ManualLinkView>(CHANGED_EVENT, { detail: view }));
}

/** Current setting; re-renders when it is changed in the header or another tab. */
export function useManualLinkView(): [ManualLinkView, (view: ManualLinkView) => void] {
    const [view, setView] = useState<ManualLinkView>(getManualLinkView);

    useEffect(() => {
        const onChanged = (e: Event) => setView((e as CustomEvent<ManualLinkView>).detail ?? getManualLinkView());
        const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setView(getManualLinkView()); };
        window.addEventListener(CHANGED_EVENT, onChanged);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(CHANGED_EVENT, onChanged);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    return [view, setManualLinkView];
}
