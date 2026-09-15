// Router root - 2 shells (HQ + Field) + Login
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
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
import Payment from './hq/Payment.jsx';
import OTDPage from './hq/OTDPage.jsx';
import OTDPage_css from './hq/OTDPage.css?inline';
import { ICON } from './icons.jsx';
import FieldHome from './field/FieldHome.jsx';
import DailyProgress from './field/DailyProgress.jsx';
import DailyReportForm from './components/DailyReportForm.jsx';
import DailyReportForm_css from './components/DailyReportForm.css?inline';
import { FieldMaterial, FieldManpower, FieldIssue, FieldReview, FieldSync, ProjectWbsSelection } from './field/FieldStubs.jsx';
import MasterDataList from './governance/MasterDataList.jsx';
import MasterDataEdit from './governance/MasterDataEdit.jsx';
import Approval from './governance/Approval.jsx';
import ChainConfig from './governance/ChainConfig.jsx';
import AuditLog from './governance/AuditLog.jsx';
import { getToken, projects as api } from './api/index.js';
import UploadWizard from './components/UploadWizard.jsx';

function Protected({ children, role }) {
  const t = getToken();
  if (!t) return <Navigate to="/login" replace />;
  return children;
}

function ProjectsList() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.list().then(setItems); }, []);
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dự án</h1>
          <div className="meta">{items.length} dự án bạn có quyền truy cập</div>
        </div>
      </div>
      <div className="pillar-grid">
        {items.map(p => (
          <div key={p.id} className="pillar-card" onClick={() => window.location.href = `/hq/projects/${p.id}`}>
            <div className="head">
              <h3>{p.code}</h3>
              <span className="badge" style={{ background: 'var(--c-on-track-bg)', color: 'var(--c-on-track)' }}>ACTIVE</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>{p.name_vi}</div>
            <div className="metric-label">{p.name_en}</div>
            <div className="field-stat"><span className="k">Package</span><span className="v">{p.package || '—'}</span></div>
            <div className="field-stat"><span className="k">Rev prefix</span><span className="v"><code>{p.rev_prefix || '—'}</code></span></div>
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
        <Route path="/upload" element={<UploadPage />} />
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
          <Route path="payment" element={<Payment />} />
          <Route path="issues" element={<Issues />} />
          <Route path="issues/item" element={<IssueDetail />} />
          <Route path="uploads" element={<ReviewQueue />} />
          <Route path="notifications" element={<NotificationCenter />} />
          <Route path="master-data" element={<MasterDataList />} />
          <Route path="master-data/edit" element={<MasterDataEdit />} />
          <Route path="approval" element={<Approval />} />
          <Route path="approval-chains" element={<ChainConfig />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="otd" element={<OTDPage />} />
        </Route>

        {/* Field shell */}
        <Route path="/field" element={<Protected><FieldShell /></Protected>}>
          <Route index element={<FieldHome />} />
          <Route path="home" element={<FieldHome />} />
          <Route path="wbs" element={<Navigate to="../material" replace />} />
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
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <UploadWizard open={true} onClose={() => window.history.back()} onDone={(r) => { window.location.href = r?.bulk ? '/hq/uploads' : '/hq/projects'; }} startBulk={true} />
    </div>
  );
}
