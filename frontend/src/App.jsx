// Router root - 2 shells (HQ + Field) + Login
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import Login from './components/Login.jsx';
import SsoCallback from './components/SsoCallback.jsx';
import HqShell from './components/HqShell.jsx';
import ToastContainer from './components/Toast.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import FieldShell from './components/FieldShell.jsx';
import ControlCenter from './hq/ControlCenter.jsx';
import ProjectOverview from './hq/ProjectOverview.jsx';
import ProgressDetail from './hq/ProgressDetail.jsx';
import Issues from './hq/Issues.jsx';
import IssueDetail from './hq/IssueDetail.jsx';
import NotificationCenter from './hq/NotificationCenter.jsx';
import ReviewQueue from './hq/ReviewQueue.jsx';
import ShopList from './hq/ShopList.jsx';
import Materials from './hq/Materials.jsx';
import Manpower from './hq/Manpower.jsx';
import QaInspections from './hq/QaInspections.jsx';
import Attention from './hq/Attention.jsx';
import Payment from './hq/Payment.jsx';
import Assistant from './hq/Assistant.jsx';
import BimLibrary from './hq/BimLibrary.jsx';
// BIM viewer lazy: three + web-ifc (~1MB) must never join the main bundle.
const BimViewer = lazy(() => import('./hq/BimViewer.jsx'));
import OTDPage from './hq/OTDPage.jsx';
import OTDPage_css from './hq/OTDPage.css?inline';

import FieldHome from './field/FieldHome.jsx';
import DailyProgress from './field/DailyProgress.jsx';
import DailyReportForm from './components/DailyReportForm.jsx';
import DailyReportForm_css from './components/DailyReportForm.css?inline';
import { FieldMaterial, FieldManpower, FieldIssue, FieldReview, FieldSync } from './field/FieldStubs.jsx';
import MasterDataList from './governance/MasterDataList.jsx';
import MasterDataEdit from './governance/MasterDataEdit.jsx';
import AiConfig from './governance/AiConfig.jsx';
import Approval from './governance/Approval.jsx';
import ChainConfig from './governance/ChainConfig.jsx';
import HealthConfig from './governance/HealthConfig.jsx';
import { t } from './i18n/index.js';
import Ops from './governance/Ops.jsx';
import Security from './governance/Security.jsx';
import DataSecurity from './governance/DataSecurity.jsx';
import Backup from './governance/Backup.jsx';
import AuditLog from './governance/AuditLog.jsx';
import { getToken, projects as api } from './api/index.js';
import UploadWizard from './components/UploadWizard.jsx';

function Protected({ children }) {
  const t = getToken();
  if (!t) return <Navigate to="/login" replace />;
  return children;
}

function ProjectsList() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const nav = useNavigate();
  // No .catch: a network failure produced an unhandled rejection and rendered
  // "0 dự án" — indistinguishable from genuinely having none.
  useEffect(() => { api.list().then(setItems).catch(e => setError(e.message)); }, []);
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('app.lbl_project')}</h1>
          <div className="meta">{items.length} dự án bạn có quyền truy cập</div>
        </div>
      </div>
      {error && <div className="empty">{t('app.err_projects')}{error}</div>}
      <div className="pillar-grid">
        {items.map(p => (
          // A div with onClick is unreachable by keyboard; window.location.href
          // also re-downloaded the whole bundle and dropped app state.
          <div key={p.id} className="pillar-card" role="link" tabIndex={0}
            onClick={() => nav(`/hq/projects/${p.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(`/hq/projects/${p.id}`); } }}>
            <div className="head">
              <h3>{p.code}</h3>
              <span className="badge" style={{ background: 'var(--c-on-track-bg)', color: 'var(--c-on-track)' }}>{p.status || 'ACTIVE'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>{p.name_vi}</div>
            <div className="metric-label">{p.name_en}</div>
            <div className="field-stat"><span className="k">{t('g.package')}</span><span className="v">{p.package || '—'}</span></div>
            <div className="field-stat"><span className="k">{t('app.rev_prefix')}</span><span className="v"><code>{p.rev_prefix || '—'}</code></span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConfirmProvider>
    <style>{OTDPage_css}</style>
    <style>{DailyReportForm_css}</style>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/sso/callback" element={<SsoCallback />} />
        <Route path="/upload" element={<Protected><UploadPage /></Protected>} />
        <Route path="/field/login" element={<Login />} />

        {/* HQ shell */}
        <Route path="/hq" element={<Protected><HqShell /></Protected>}>
          <Route index element={<ControlCenter />} />
          <Route path="projects" element={<ProjectsList />} />
          <Route path="projects/:id" element={<ProjectOverview />} />
          <Route path="progress" element={<ProgressDetail />} />
          <Route path="shop" element={<ShopList />} />
          <Route path="materials" element={<Materials />} />
          <Route path="manpower" element={<Manpower />} />
          <Route path="qa" element={<QaInspections />} />
          <Route path="payment" element={<Payment />} />
          <Route path="issues" element={<Issues />} />
          <Route path="attention" element={<Attention />} />
          <Route path="issues/item" element={<IssueDetail />} />
          <Route path="uploads" element={<ReviewQueue />} />
          <Route path="notifications" element={<NotificationCenter />} />
          <Route path="master-data" element={<MasterDataList />} />
          <Route path="master-data/edit" element={<MasterDataEdit />} />
          <Route path="approval" element={<Approval />} />
          <Route path="approval-chains" element={<ChainConfig />} />
          <Route path="health-config" element={<HealthConfig />} />
          <Route path="ops" element={<Ops />} />
          <Route path="security" element={<Security />} />
          <Route path="data-security" element={<DataSecurity />} />
          <Route path="backups" element={<Backup />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="bim" element={<BimLibrary />} />
          <Route path="bim/:uploadId" element={<Suspense fallback={<div className="empty">{t('app.loading_3d')}</div>}><BimViewer /></Suspense>} />
          <Route path="ai-config" element={<AiConfig />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="otd" element={<OTDPage />} />
        </Route>

        {/* Field shell */}
        <Route path="/field" element={<Protected><FieldShell /></Protected>}>
          <Route index element={<FieldHome />} />
          <Route path="home" element={<FieldHome />} />
          <Route path="wbs" element={<Navigate to="/field/material" replace />} />
          <Route path="daily-progress" element={<DailyProgress />} />
          <Route path="daily-report" element={<DailyReportForm />} />
          <Route path="material" element={<FieldMaterial />} />
          <Route path="manpower" element={<FieldManpower />} />
          <Route path="issue" element={<FieldIssue />} />
          <Route path="review/:id" element={<FieldReview />} />
          <Route path="sync" element={<FieldSync />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    <ToastContainer />
    </ConfirmProvider>
  );
}

function UploadPage() {
  const nav = useNavigate();
  const goReview = (r) => nav(r?.bulk ? '/hq/uploads' : '/hq/projects', { replace: true });
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* onClose used to be window.history.back(), which — with the button
          labelled "Xong — sang review queue" — sent the user to the previous
          page instead of the queue, and could navigate straight out of the app
          when /upload was opened by URL. Closing the wizard returns to the
          review queue, which is what the label promises. */}
      <UploadWizard open={true} onClose={() => goReview({ bulk: true })} onDone={goReview} startBulk={true} />
    </div>
  );
}
