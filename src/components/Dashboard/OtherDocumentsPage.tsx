import React from 'react';
import PageHeader from '../PageHeader';
import DashboardOtherDocuments from './OtherDocuments/DashboardOtherDocument';
import './Dashboard.scss';

/** Other Documents as its own page (header link). It used to be a Dashboard tab. */
const OtherDocumentsPage: React.FC<{ userId: string }> = ({ userId }) => (
    <>
        <PageHeader title="Other documents" />
        <main className="dashboard-main">
            <DashboardOtherDocuments userId={userId} />
        </main>
    </>
);

export default OtherDocumentsPage;
