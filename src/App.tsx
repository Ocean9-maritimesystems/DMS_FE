import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import "font-awesome/css/font-awesome.min.css";
import "primereact/resources/themes/bootstrap4-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "bootstrap/dist/css/bootstrap.css";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Toast } from 'primereact/toast';
import { ThemeProvider } from './contexts/ThemeContext';
import LandingPage from './pages/LandingPage';
// Each page is loaded when it is first opened (the login page loads only what it needs).
const ManualMainPage = lazy(() => import('./components/Manuals/MainPage/ManualMainPage'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const CircularsList = lazy(() => import('./components/Circulars/CircularsList'));
const InboxPage = lazy(() => import('./components/Features/InboxPage'));
const SuggestionsPage = lazy(() => import('./components/Features/SuggestionsPage'));
const SearchPage = lazy(() => import('./components/Search/SearchPage'));
const PendingAckPage = lazy(() => import('./components/PendingAck/PendingAckPage'));
const OtherDocumentsPage = lazy(() => import('./components/Dashboard/OtherDocumentsPage'));
const VesselSyncPage = lazy(() => import('./components/Dashboard/VesselSyncPage'));

const PageLoading: React.FC = () => (
  <div className="page-loading" role="status" aria-live="polite">
    <i className="pi pi-spin pi-spinner" aria-hidden="true" /> Loading…
  </div>
);
import authService, { AuthUser } from './services/authService';
import { registerToast } from './services/notify';
import { login as loginAction, logout as logoutAction } from './store/slices/userSlice';
import "./App.css";
import "./styles/refresh.scss";

/** Old dashboard links (/manualView?mode=new) now open the Manuals page with a filtered tree. */
const ManualViewRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  return <Navigate to={mode && mode !== 'all' ? `/manuals?mode=${encodeURIComponent(mode)}` : '/manuals'} replace />;
};

const CircularViewerWrapper: React.FC<{ userId: string }> = ({ userId }) => {
  const [searchParams] = useSearchParams();
  const calledMode = searchParams.get('cirmode') || 'all';
  return <CircularsList userId={userId} calledMode={calledMode} focusId={searchParams.get('id')} />;
};

/** The logged-in user comes from the login token (no more hard-coded TestUser13). */
const useCurrentUser = () => {
  const dispatch = useDispatch();
  const [user, setUser] = useState<AuthUser | null>(authService.currentUser());

  useEffect(() => {
    const sync = (u: AuthUser | null) => {
      setUser(u);
      if (u) dispatch(loginAction({ id: u.userId, name: u.userName, email: '' }));
      else dispatch(logoutAction());
    };
    sync(authService.currentUser());
    return authService.onChange(sync);
  }, [dispatch]);

  // Log out automatically when the token expires.
  useEffect(() => {
    if (!user) return;
    const ms = new Date(user.expiresUtc).getTime() - Date.now();
    // setTimeout runs at once for delays above ~24.8 days (2^31-1 ms), so a long-lived token is capped and
    // checked again when the timer fires.
    const MAX_DELAY = 2_147_483_647;
    const id = window.setTimeout(() => {
      if (ms > MAX_DELAY) setUser(authService.currentUser());
      else authService.logout();
    }, Math.min(Math.max(0, ms), MAX_DELAY));
    return () => window.clearTimeout(id);
  }, [user]);

  return user;
};

const App: React.FC = () => {
  const user = useCurrentUser();
  const toast = useRef<Toast>(null);

  useEffect(() => {
    registerToast(toast.current);
    return () => registerToast(null);
  }, []);

  return (
    <div>
      <Toast ref={toast} />
      <ThemeProvider>
        <BrowserRouter>
          {!user ? (
            <Routes>
              <Route path="*" element={<LandingPage />} />
            </Routes>
          ) : (
            <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard userId={user.userId} />} />
              <Route path="/main" element={<ManualMainPage userId={user.userId} />} />
              <Route path="/manuals" element={<ManualMainPage userId={user.userId} />} />
              <Route path="/manualView" element={<ManualViewRedirect />} />
              <Route path="/circulars" element={<CircularViewerWrapper userId={user.userId} />} />
              <Route path="/inbox" element={<InboxPage />} />
              {/* Reports open from each area (Manuals / Circulars dashboards, Other documents > All vessels). */}
              <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
              <Route path="/suggestions" element={<SuggestionsPage />} />
              <Route path="/otherdocuments" element={<OtherDocumentsPage userId={user.userId} />} />
              <Route path="/vessel-sync" element={<VesselSyncPage />} />
              {/* Folders are part of Other Documents. */}
              <Route path="/folders" element={<Navigate to="/otherdocuments" replace />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/pending" element={<PendingAckPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </Suspense>
          )}
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
};

export default App;
