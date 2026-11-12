import React, { useState, useEffect } from 'react';
import HtmlDiff from '../../utils/HtmlDiff';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './CompareVersionDetails.scss';
import DOMPurify from 'dompurify';
  
type ManualFormProps = {
    closeForm: () => void;
    manualID: number;
    DM_ManualVersionID_ToCompare: number;
};
  
const ViewCompareManualDetails: React.FC<ManualFormProps> = ({ closeForm, manualID, DM_ManualVersionID_ToCompare }) => {
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [compareVersion, setCompareVersion] = useState<string>('');
    const [compareText, setCompareText] = useState<string>('');
    const [currentText, setCurrentText] = useState<string>('');
    const [showDiff, setShowDiff] = useState(false);
  
    useEffect(() => {
        const fetchData = async() => {
          dmsLifecycleService.getApiCall(`Manuals/GetCompareVersion_Content?dm_ManualID=${manualID}&compare_ManualVersionID=${DM_ManualVersionID_ToCompare}`)
              .then(data => {
                  setCurrentVersion(data.current_Version);
                  setCompareVersion(data.compare_Version);
                  setCurrentText(data.current_ManualContent);
                  setCompareText(data.compare_ManualContent);
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
            <div className="compare-actions">
                {showDiff ? ( 
                    <div className="diff-legend">
                        <div className="legend-item">
                                <span className="legend-label">New Content - </span>
                                <span className="legend-box new">green highlight</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-label">Deleted Content - </span>
                                <span className="legend-box deleted">red highlight with strikethrough</span>
                            </div>
                        </div>
                ) : null}
                <div className="action-buttons">
                    <button className="button" onClick={() => setShowDiff(!showDiff)}>
                        {showDiff ? 'Hide Diff' : 'View Diff'}
                    </button>
                    <button className="button" onClick={closeForm}>Close</button>
                </div>
            </div>
            <div className="compare-content">
                {showDiff ? (
                    <div className="diffPanel diff-content">
                        <HtmlDiff oldHtml={compareText} newHtml={currentText} />
                    </div>
                ) : (
                     <div style={{ display: 'flex', width: '100%' }}>
                        <div className='diffPanel' style={{ borderRight: '1px solid #e1e4e8' }}>
                            <h3 style={{ fontSize: '1.25rem', color: '#24292e', borderBottom: '1px solid #e1e4e8', paddingBottom: '8px' }}>
                                Current Version : {currentVersion}
                            </h3>
                            <div className="diff-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentText) }} />
                        </div>
                        <div className='diffPanel' style={{ borderRight: '1px solid #e1e4e8' }}>
                            <h3 style={{ fontSize: '1.25rem', color: '#24292e', borderBottom: '1px solid #e1e4e8', paddingBottom: '8px' }}>
                                Compare Version : {compareVersion}
                            </h3>
                            <div className="diff-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(compareText) }} />
                        </div>
                    </div>
                )}
            </div>
          </div>
      );
  };
  
  export default ViewCompareManualDetails;