import { Route, Routes } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import WorkspacePage from '@/pages/WorkspacePage';
import HeatCalcPage from '@/pages/HeatCalcPage';
import ElecCalcPage from '@/pages/ElecCalcPage';
import SpecificationPage from '@/pages/SpecificationPage';
import ReportPage from '@/pages/ReportPage';
import ProjectsPage from '@/pages/ProjectsPage';
import AdminLayout from '@/pages/admin/AdminLayout';
import UsersPage from '@/pages/admin/UsersPage';
import CoefficientsPage from '@/pages/admin/CoefficientsPage';
import DatabasePage from '@/pages/admin/DatabasePage';
import GuestHelpPage from '@/pages/help/GuestHelpPage';
import EmployeeHelpPage from '@/pages/help/EmployeeHelpPage';
import AdminHelpPage from '@/pages/help/AdminHelpPage';
import ReportWizardPage from '@/pages/ReportWizardPage';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { ROUTES } from './routes';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<HomePage />} />
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route path="/help/guest" element={<GuestHelpPage />} />
      <Route path="/help/employee" element={<EmployeeHelpPage />} />
      <Route path="/help/admin" element={<AdminHelpPage />} />

      <Route
        path={ROUTES.reportWizard}
        element={
          <ProtectedRoute allow={['employee', 'admin']}>
            <ReportWizardPage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute allow={['guest', 'employee']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path={ROUTES.workspace} element={<WorkspacePage />} />
        <Route path={ROUTES.heatCalc} element={<HeatCalcPage />} />
        <Route path={ROUTES.elecCalc} element={<ElecCalcPage />} />
        <Route path={ROUTES.specification} element={<SpecificationPage />} />
        <Route path={ROUTES.report} element={<ReportPage />} />
      </Route>

      <Route
        path={ROUTES.projects}
        element={
          <ProtectedRoute allow={['employee']}>
            <MainLayout>
              <ProjectsPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path={ROUTES.admin}
        element={
          <ProtectedRoute allow={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="users" element={<UsersPage />} />
        <Route path="coefficients" element={<CoefficientsPage />} />
        <Route path="database" element={<DatabasePage />} />
      </Route>
    </Routes>
  );
}
