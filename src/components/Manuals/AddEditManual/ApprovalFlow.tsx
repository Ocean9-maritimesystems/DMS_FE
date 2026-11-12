import React, { useEffect, useState } from 'react';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './ApprovalFlow.scss'; 
import DOMPurify from 'dompurify';


export interface ApprovalFlowProps {
    currentFlow: number;
}

const ApprovalFlow: React.FC<ApprovalFlowProps> = ({ currentFlow }) => {

    const [approvalFlowList, setApprovalFlowList] = useState<{ flowDesc: string }[]>([]);

    useEffect(() => {
      dmsLifecycleService.getApiCall<{ approvalFlow?: string }[] | null>(`Manuals/GetApprovalDetailsForFlowID/${currentFlow}`)
        .then((data) => {
          let list: { flowDesc: string }[] = [];
          if (Array.isArray(data)) {
            list = data.map((item) => ({ flowDesc: item.approvalFlow || '' }));
          } 
          setApprovalFlowList(list);
        })
        .catch(() => {
          setApprovalFlowList([]);
        });
    }, [currentFlow]);
    
  return (
    <div className="approval-flow" style={{ width: `${approvalFlowList.length * 120}px` }}>
      {approvalFlowList.map((flow, index) => (
        <div key={index} className={`step inprogress`}>
          <div className="circle">{index + 1}</div>
          <div
            className="label"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((flow.flowDesc || '').replace(/\r?\n/g, '<br />')) }}
          />
          {index < approvalFlowList.length - 1 && <div className="line" />}
        </div>
      ))}
    </div>
  );
};

export default ApprovalFlow;
