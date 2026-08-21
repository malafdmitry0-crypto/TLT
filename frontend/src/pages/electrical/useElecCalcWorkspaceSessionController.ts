/**
 * @module electrical/workspace-session-controller
 * @owner electrical
 * Owns: project/auth capabilities, boot view, system view, table dragging,
 *   UUID/legacy variant identity, focusable table scroll ref, workspace navigate.
 * Does-not: data plane, column settings, presentation map, query semantics.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import {
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';
import type { ElectricalNavigationState } from '@/pages/electrical/elecCalcPageModel';
import { useAuthStore } from '@/store/authStore';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalVariant } from '@/types/electricalVariant';

const SYSTEM_VIEWS = new Set<ElectricalSystemView>([
  'all',
  'unassigned',
  'self_regulating',
  'resistive',
  'skin',
  'mineral',
]);

function systemViewFromNavigation(state: unknown): ElectricalSystemView | null {
  const view = (state as ElectricalNavigationState | null | undefined)?.systemView;
  if (view && SYSTEM_VIEWS.has(view)) return view;
  return null;
}

export type UseElecCalcWorkspaceSessionControllerArgs = {
  electricalVariant: ElectricalVariant;
};

export function useElecCalcWorkspaceSessionController({
  electricalVariant,
}: UseElecCalcWorkspaceSessionControllerArgs) {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const location = useLocation();
  const navigate = useNavigate();

  /** One system tab for the whole workspace (assign chrome + filtered table). */
  const [systemView, setSystemView] = useState<ElectricalSystemView>(
    () => systemViewFromNavigation(location.state) ?? 'unassigned',
  );
  const [tableDragging, setTableDragging] = useState(false);

  // Spec «Исправить» navigates here with state.systemView = unassigned.
  useEffect(() => {
    const next = systemViewFromNavigation(location.state);
    if (next) setSystemView(next);
  }, [location.state]);

  const {
    availableCableTypeKeys,
    availableCableTypes,
    electricalGlideEnabled,
  } = useElecCalcBootViewState({ location });

  // The parent mounts this workspace only for variants that still have a
  // temporary numeric adapter. UUID remains the identity everywhere else.
  const variant = electricalVariant.legacy_variant_number as CalculationVariant;
  const electricalVariantId = electricalVariant.id;
  const electricalVariantName = electricalVariant.name;

  const tableScrollRegionsRef = useRef<HTMLDivElement>(null);
  useFocusableTableScrollRegions(
    tableScrollRegionsRef,
    'Таблица электротехнического расчёта',
    Boolean(project),
  );

  return {
    project,
    registeredUserId,
    isEmployee,
    isRegisteredUser,
    commercialFeaturesAvailable,
    navigate,
    systemView,
    setSystemView,
    tableDragging,
    setTableDragging,
    availableCableTypeKeys,
    availableCableTypes,
    electricalGlideEnabled,
    variant,
    electricalVariantId,
    electricalVariantName,
    tableScrollRegionsRef,
  };
}
