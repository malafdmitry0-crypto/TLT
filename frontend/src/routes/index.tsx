import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { ROUTES } from './routes';

const HomePage = lazy(() => import('@/pages/HomePage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'));
const HeatCalcPage = lazy(() => import('@/pages/HeatCalcPage'));
const ElecCalcPage = lazy(() => import('@/pages/ElecCalcPage'));
const SpecificationPage = lazy(() => import('@/pages/SpecificationPage'));
const ReportPage = lazy(() => import('@/pages/ReportPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ReportWizardPage = lazy(() => import('@/pages/ReportWizardPage'));

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const CoefficientsPage = lazy(() => import('@/pages/admin/CoefficientsPage'));
const DatabasePage = lazy(() => import('@/pages/admin/DatabasePage'));
const ReferencesPage = lazy(() => import('@/pages/admin/ReferencesPage'));
const FormulasPage = lazy(() => import('@/pages/admin/FormulasPage'));

const GuestHelpPage = lazy(() => import('@/pages/help/GuestHelpPage'));
const EmployeeHelpPage = lazy(() => import('@/pages/help/EmployeeHelpPage'));
const AdminHelpPage = lazy(() => import('@/pages/help/AdminHelpPage'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
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
          <Route path="references" element={<ReferencesPage />} />
          <Route path="formulas" element={<FormulasPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
