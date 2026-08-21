/**
 * @module heatcalc/page-context
 * @owner heat
 * Route-level context for HeatCalcPage: project, auth, query client, navigate,
 * workspace header registration, and route shell effects.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useHeatCalcRouteShellEffects } from '@/pages/heatcalc/useHeatCalcRouteShellEffects';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';

export function useHeatCalcPageContext() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isRegisteredUser = role === 'employee' || role === 'admin';
  const setWorkspaceHeaderContext = useWorkspaceHeaderStore((s) => s.setContext);

  useHeatCalcRouteShellEffects({
    projectPresent: Boolean(project),
    setWorkspaceHeaderContext,
  });

  return {
    queryClient,
    navigate,
    project,
    role,
    registeredUserId,
    isRegisteredUser,
  };
}
