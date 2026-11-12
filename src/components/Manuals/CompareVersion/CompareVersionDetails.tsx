import React, { useState, useEffect } from 'react';
import * as Diff from 'diff';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './CompareVersionDetails.scss';

type ManualFormProps = {
    closeForm: () => void;
    manualID: number;
    DM_ManualVersionID_ToCompare: number;
};

const CompareVersionDetails: React.FC<ManualFormProps> = ({ closeForm, manualID, DM_ManualVersionID_ToCompare }) => {
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [compareVersion, setCompareVersion] = useState<string>('');
    const [diffResult, setDiffResult] = useState<Diff.Change[]>([]);

    /** The text of a version. DOMParser builds an inert document: nothing in the manual HTML runs or loads. */
    const formatHTMLForDisplay = (htmlContent: string) =>
        new DOMParser().parseFromString(htmlContent || '', 'text/html').body.textContent ?? '';

    const renderDiff = (changes: Diff.Change[]) => {
        const diffStyles = {
            removed: {
                backgroundColor: '#ffd7d5',
                textDecoration: 'line-through',
                color: '#251414',
                display: 'inline',
            },
            added: {
                backgroundColor: '#cdffd8',

                color: '#251414',
                display: 'inline',
            },
            unchanged: {
                color: 'var(--text-primary) !important',
                display: 'inline'
            },
            diffLine: {
                display: 'flex',
                width: '100%',
                marginBottom: '8px'
            },
            diffPanel: {
                flex: 1,
                padding: '5px 5px',
                backgroundColor: '#f6f8fa',
                overflowX: 'auto' as React.CSSProperties['overflowX'],
                whiteSpace: 'nowrap' as const
            }
        };

        const leftContent = changes.map((part, index) => {
            if (part.removed || !part.added) {
                return (
                    <span key={index} style={part.removed ? diffStyles.removed : diffStyles.unchanged}>
                        {formatHTMLForDisplay(part.value)}
                    </span>
                );
            }
            return null;
        });

        const rightContent = changes.map((part, index) => {
            if (part.added || !part.removed) {
                return (
                    <span key={index} style={part.added ? diffStyles.added : diffStyles.unchanged}>
                        {formatHTMLForDisplay(part.value)}
                    </span>
                );
            }
            return null;
        });

        return (
            <div style={{ display: 'flex', width: '100%' }}>
                <div style={{ ...diffStyles.diffPanel, borderRight: '1px solid #e1e4e8' }}>
                    <h3 style={{ fontSize: '1.25rem', color: '#24292e', borderBottom: '1px solid #e1e4e8', paddingBottom: '8px' }}>
                        Compare Version : {compareVersion}
                    </h3>
                    <div className="diff-content">
                        {leftContent}
                    </div>
                </div>
                <div style={diffStyles.diffPanel}>
                    <h3 style={{ fontSize: '1.25rem', color: '#24292e', borderBottom: '1px solid #e1e4e8', paddingBottom: '8px' }}>
                        Current Version : {currentVersion}
                    </h3>
                    <div className="diff-content">
                        {rightContent}
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
      const fetchData = async() => {
        dmsLifecycleService.getApiCall(`Manuals/GetCompareVersion_Content?dm_ManualID=${manualID}&compare_ManualVersionID=${DM_ManualVersionID_ToCompare}`)
            .then(data => {
                setCurrentVersion(data.current_Version);
                setCompareVersion(data.compare_Version);

                const diff = Diff.diffWords(
                    data.compare_ManualContent,
                    data.current_ManualContent
                );
                setDiffResult(diff);
            })
            .catch(() => {
                setCurrentVersion('');
                setCompareVersion('');
            });
        }

        fetchData();
    }, [DM_ManualVersionID_ToCompare, manualID]);

    return (
        <div className="compare-version-details">
            <div style={{ marginBottom: '1px', width: '100%', flexDirection: 'column', display: 'flex' }}>
                <div style={{ height: '100%', overflowY: 'auto', border: '1.5px solid #251414' }}>
                    {renderDiff(diffResult)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                    <button className="button" onClick={closeForm}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default CompareVersionDetails;