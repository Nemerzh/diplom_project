import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import Layout from "./Layout";
import AlertsPage from "./pages/AlertsPage";
import DashboardPage from "./pages/DashboardPage";
import MetersPage from "./pages/MetersPage";
import NetworkPage from "./pages/NetworkPage";
import TopologyPage from "./pages/TopologyPage";
import ReadingsPage from "./pages/ReadingsPage";
import ReportsPage from "./pages/ReportsPage";
import SitesPage from "./pages/SitesPage";
import SystemStatusPage from "./pages/SystemStatusPage";
import AdminAlertRulesPage from "./pages/admin/AdminAlertRulesPage";
import AdminEnterprisesPage from "./pages/admin/AdminEnterprisesPage";
import AdminGridPage from "./pages/admin/AdminGridPage";
import AdminMetersPage from "./pages/admin/AdminMetersPage";
import AdminSitesPage from "./pages/admin/AdminSitesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="meters" element={<MetersPage />} />
          <Route path="readings" element={<ReadingsPage />} />
          <Route path="topology" element={<TopologyPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="system" element={<SystemStatusPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="enterprises" element={<AdminEnterprisesPage />} />
          <Route path="sites" element={<AdminSitesPage />} />
          <Route path="meters" element={<AdminMetersPage />} />
          <Route path="grid" element={<AdminGridPage />} />
          <Route path="alert-rules" element={<AdminAlertRulesPage />} />
          <Route path="*" element={<Navigate to="/admin/enterprises" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
