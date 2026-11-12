import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../PageHeader';
import dmsLifecycleService, { errorMessage } from '../../services/DMSLifecycleService';
import { SearchHit } from '../../types/api';
import { itemIcon, itemLink } from '../../config/itemLinks';
import { pathOf, rememberSearch } from '../../config/searchReturn';
import { formatDate } from '../utils/formatDate';
import { highlightParts, htmlToText, queryWords } from '../utils/text';
import './SearchPage.scss';

/** Filters offered above the results. `types` is what the API's ?types= expects. */
const FILTERS: { key: string; label: string; types: string | null }[] = [
    { key: 'all', label: 'All', types: null },
    { key: 'Manual', label: 'Manuals', types: 'Manual' },
    { key: 'Circular', label: 'Circulars & Alerts', types: 'Circular' },
    { key: 'Document', label: 'Documents', types: 'Document' },
    { key: 'Suggestion', label: 'Suggestions', types: 'Suggestion' },
];

interface VesselName {
    vesselID: number;
    vslName: string;
}

/** Text with the query words marked. Plain React text: nothing from the result is rendered as HTML. */
const Highlighted: React.FC<{ text: string; words: string[] }> = ({ text, words }) => (
    <>
        {highlightParts(text, words).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>))}
    </>
);

/**
 * Global search (GET api/Search): one box over manuals (number, name and text), circulars and alerts, other
 * documents, and suggestions. Every word of the query must match. Opened from the header search box.
 */
const SearchPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const query = (searchParams.get('q') ?? '').trim();
    const filterKey = searchParams.get('types') ?? 'all';
    const filter = FILTERS.find((f) => f.key.toLowerCase() === filterKey.toLowerCase()) ?? FILTERS[0];

    const [hits, setHits] = useState<SearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [vessels, setVessels] = useState<Record<number, string>>({});

    const words = useMemo(() => queryWords(query), [query]);

    useEffect(() => {
        dmsLifecycleService
            .getApiCall<VesselName[]>('Vessel/GetVessels')
            .then((list) => setVessels(Object.fromEntries((list ?? []).map((v) => [v.vesselID, v.vslName]))))
            .catch(() => setVessels({})); // names are a nicety: show IDs if this fails
    }, []);

    useEffect(() => {
        if (query.length < 2) {
            setHits([]);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        const typesParam = filter.types ? `&types=${encodeURIComponent(filter.types)}` : '';
        dmsLifecycleService
            .getApiCall<SearchHit[]>(`Search?q=${encodeURIComponent(query)}${typesParam}`)
            .then((data) => !cancelled && setHits(data ?? []))
            .catch((err) => {
                if (cancelled) return;
                setHits([]);
                setError(errorMessage(err, 'The search could not be completed.'));
            })
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [query, filter.types]);

    const setFilter = (key: string) => {
        const params = new URLSearchParams();
        params.set('q', query);
        if (key !== 'all') params.set('types', key);
        navigate(`/search?${params.toString()}`);
    };

    const vesselLabel = (vesselId?: number | null) => {
        if (vesselId == null || vesselId === -1) return 'All vessels';
        if (vesselId === -2) return 'Office only';
        return vessels[vesselId] ?? `Vessel ${vesselId}`;
    };

    return (
        <>
            <PageHeader title="Search" />
            <main className="search-page">
                <div className="search-toolbar">
                    <div className="search-filters" role="group" aria-label="What to search">
                        {FILTERS.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                className={'search-filter' + (f.key === filter.key ? ' active' : '')}
                                aria-pressed={f.key === filter.key}
                                onClick={() => setFilter(f.key)}
                                disabled={query.length < 2}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    {query.length >= 2 && !loading && !error && (
                        <span className="search-count" aria-live="polite">
                            {hits.length === 0 ? 'No results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`} for “{query}”
                        </span>
                    )}
                </div>

                {query.length < 2 && (
                    <div className="search-empty">
                        <i className="pi pi-search" aria-hidden="true" />
                        <p>Type at least two characters in the search box at the top of the page and press Enter.</p>
                        <p className="search-hint">Every word must match. Manuals are searched by number, name and text.</p>
                    </div>
                )}

                {loading && (
                    <div className="search-empty" aria-busy="true">
                        <i className="pi pi-spin pi-spinner" aria-hidden="true" />
                        <p>Searching…</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="search-error" role="alert">
                        <i className="pi pi-exclamation-circle" aria-hidden="true" /> {error}
                    </div>
                )}

                {!loading && !error && query.length >= 2 && hits.length === 0 && (
                    <div className="search-empty">
                        <i className="pi pi-inbox" aria-hidden="true" />
                        <p>Nothing matches every word of “{query}”.</p>
                        <p className="search-hint">Try fewer words, or another spelling.</p>
                    </div>
                )}

                {!loading && hits.length > 0 && (
                    <ol className="search-results">
                        {hits.map((hit) => {
                            const link = itemLink(hit.itemType, hit.itemID);
                            const title = hit.title || hit.number || `${hit.itemType} ${hit.itemID}`;
                            const snippet = htmlToText(hit.snippet);
                            return (
                                <li key={`${hit.itemType}-${hit.itemID}`} className="search-result">
                                    <i className={`search-result-icon ${itemIcon(hit.itemType)}`} aria-hidden="true" />
                                    <div className="search-result-body">
                                        <div className="search-result-meta">
                                            <span className={`search-type search-type-${hit.itemType.toLowerCase()}`}>{hit.itemType}</span>
                                            {hit.number && <span className="search-number"><Highlighted text={hit.number} words={words} /></span>}
                                            <span>{vesselLabel(hit.vesselID)}</span>
                                            {hit.date && <span>{formatDate(hit.date)}</span>}
                                        </div>
                                        <h2 className="search-result-title">
                                            {link ? (
                                                <Link to={link} onClick={() => rememberSearch({ url: `${location.pathname}${location.search}`, query, target: pathOf(link) })}>
                                                    <Highlighted text={title} words={words} />
                                                </Link>
                                            ) : (
                                                <Highlighted text={title} words={words} />
                                            )}
                                        </h2>
                                        {snippet && (
                                            <p className="search-snippet">
                                                <Highlighted text={snippet} words={words} />
                                            </p>
                                        )}
                                        {!link && (
                                            <p className="search-nolink">
                                                {hit.itemType === 'Suggestion'
                                                    ? 'Suggestions do not have a page in the office app yet.'
                                                    : 'Open it from Other docs.'}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </main>
        </>
    );
};

export default SearchPage;
