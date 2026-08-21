/**
 * @module specification/query-session
 * @owner specification
 * Project/variant identity + specification/settings/accessories query session.
 * Mutations and generation orchestration stay in useSpecificationPageModel.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  getSpecification,
  getSpecificationSettings,
  listAccessoriesExtended,
} from '@/api/specifications';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useLegacyElectricalVariantContext } from '@/hooks/useLegacyElectricalVariantContext';

export function useSpecificationQuerySession() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sessionId = useAuthStore((s) => s.sessionId);
  const isEmployee = role === 'employee' || role === 'admin';
  const canMutateProject = Boolean(project && (
    role === 'admin'
    || (role === 'employee' && project.user_id === userId)
    || (role === 'guest' && project.session_id === sessionId)
  ));
  const canManuallyEdit = canMutateProject && isEmployee;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const variantContext = useLegacyElectricalVariantContext(project?.id);
  const selectedElectricalVariant = variantContext.selectedVariant;
  const variant = variantContext.legacyVariantNumber ?? null;
  /** UUID-scoped data plane: any project ER is loadable, including no legacy slot. */
  const uuidDataPlaneEnabled = Boolean(
    project && selectedElectricalVariant?.id && !variantContext.isLoading && !variantContext.isError,
  );
  const specificationQueryKey = [
    'spec',
    project?.id,
    selectedElectricalVariant?.id,
  ] as const;

  const {
    data: spec,
    refetch,
    isLoading: specLoading,
    isError: specError,
    error: specErrorObj,
    isFetching: specFetching,
  } = useQuery({
    queryKey: specificationQueryKey,
    queryFn: () => getSpecification(
      project!.id,
      selectedElectricalVariant!.id,
    ),
    enabled: uuidDataPlaneEnabled,
  });

  const { data: projectSettings } = useQuery({
    queryKey: ['spec-settings', project?.id],
    queryFn: () => getSpecificationSettings(project!.id),
    enabled: Boolean(project?.id),
  });

  const { data: accessories = [] } = useQuery({
    queryKey: referenceQueryKeys.accessoriesExtended,
    queryFn: listAccessoriesExtended,
    enabled: canManuallyEdit,
    ...referenceQueryOptions,
  });

  return {
    project,
    role,
    userId,
    sessionId,
    isEmployee,
    canMutateProject,
    canManuallyEdit,
    navigate,
    qc,
    variantContext,
    selectedElectricalVariant,
    variant,
    uuidDataPlaneEnabled,
    /** @deprecated alias — same as uuidDataPlaneEnabled after UUID cutover */
    legacyDataPlaneEnabled: uuidDataPlaneEnabled,
    specificationQueryKey,
    spec,
    refetch,
    specLoading,
    specError,
    specErrorObj,
    specFetching,
    projectSettings,
    accessories,
  };
}
