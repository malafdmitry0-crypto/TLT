import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CloseCircleFilled,
  CloseCircleOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  listElectricalCandidateFolders,
  listElectricalCandidates,
  getElectricalQueryCapabilities,
  listCables,
  queryElectrical,
  selectCableForVariants,
  type CableSource,
} from '@/api/calculations';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { useAuthStore } from '@/store/authStore';
import {
  normalizeCalculationVariant,
  useCalculationVariantStore,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import ElectricalCandidateColumnSettingsModal from '@/components/electrical/ElectricalCandidateColumnSettingsModal';
import ElectricalColumnSettingsModal from '@/components/electrical/ElectricalColumnSettingsModal';
import ElectricalBatchActionBar from '@/pages/electrical/ElectricalBatchActionBar';
import ElecCalcCandidateCompareBar from '@/pages/electrical/ElecCalcCandidateCompareBar';
import ElecCalcCandidateFolderTabs from '@/pages/electrical/ElecCalcCandidateFolderTabs';
import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';
import ElecCalcRecalculationSettings from '@/pages/electrical/ElecCalcRecalculationSettings';
import ElecCalcSelectedCableSummary from '@/pages/electrical/ElecCalcSelectedCableSummary';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';
import type {
  ElectricalCandidate,
  ElectricalCandidateFolder,
  ElectricalCalcSummary,
  ElectricalQueryResponse,
} from '@/types/calculation';
import {
  type ElectricalColumnKey,
} from '@/utils/electricalTableColumns';
import {
  type ElectricalCalculationCableSource,
} from '@/utils/electricalTableViewSettings';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  catalogSourceFromSnapshot,
  shouldShowProjectCableOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import {
  resolveCableRowForMark,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import {
  isResistiveCableType,
} from '@/pages/electrical/elecCalcCableTypeModel';
import {
  buildElectricalQueryRequest,
} from '@/pages/electrical/elecCalcQueryModel';
import {
  calculationVariantLabel,
} from '@/pages/electrical/elecCalcVariantModel';
import {
  buildElectricalErrorItems,
  electricalErrorGuidanceForItem,
  resolveActiveElectricalErrorItem,
} from '@/pages/electrical/elecCalcErrorSummaryModel';
import {
  buildElecCalcSummaryViewModel,
} from '@/pages/electrical/elecCalcSummaryModel';
import {
  isElectricalLayoutCellEditable as resolveElectricalLayoutCellEditable,
  validateElectricalLayoutCellCommit,
} from '@/pages/electrical/elecCalcLayoutModel';
import {
  CABLE_TYPE_LABEL,
  objectDisplayName,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import {
  getCableMark,
  getCableMarkSource,
} from '@/pages/electrical/elecCalcResultValueModel';
import { useElecCalcAntTableHandlers } from '@/pages/electrical/useElecCalcAntTableHandlers';
import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';
import { useElecCalcCableCatalogView } from '@/pages/electrical/useElecCalcCableCatalogView';
import { useElecCalcCableMarkOptions } from '@/pages/electrical/useElecCalcCableMarkOptions';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import { useElecCalcBatchJobOrchestration } from '@/pages/electrical/useElecCalcBatchJobOrchestration';
import { useElecCalcCandidateColumns } from '@/pages/electrical/useElecCalcCandidateColumns';
import { useElecCalcCandidateCompareState } from '@/pages/electrical/useElecCalcCandidateCompareState';
import { useElecCalcCandidateFolderUiState } from '@/pages/electrical/useElecCalcCandidateFolderUiState';
import { useElecCalcCandidateFolderViewModel } from '@/pages/electrical/useElecCalcCandidateFolderViewModel';
import { useElecCalcCandidateGlideActions } from '@/pages/electrical/useElecCalcCandidateGlideActions';
import { useElecCalcCandidateMutationFlow } from '@/pages/electrical/useElecCalcCandidateMutationFlow';
import { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import { useElecCalcDataLifecycleEffects } from '@/pages/electrical/useElecCalcDataLifecycleEffects';
import { useElecCalcElectricalColumns } from '@/pages/electrical/useElecCalcElectricalColumns';
import { useElecCalcElectricalColumnCopyValue } from '@/pages/electrical/useElecCalcElectricalColumnCopyValue';
import { useElecCalcElectricalColumnRenderers } from '@/pages/electrical/useElecCalcElectricalColumnRenderers';
import { useElecCalcFilterOptions } from '@/pages/electrical/useElecCalcFilterOptions';
import { useElecCalcCandidateGlideCellState } from '@/pages/electrical/useElecCalcCandidateGlideCellState';
import { useElecCalcGlideActions } from '@/pages/electrical/useElecCalcGlideActions';
import { useElecCalcGlideColumnModel } from '@/pages/electrical/useElecCalcGlideColumnModel';
import { useElecCalcGlideCellState } from '@/pages/electrical/useElecCalcGlideCellState';
import { useElecCalcPageScopeEffects } from '@/pages/electrical/useElecCalcPageScopeEffects';
import { useElecCalcPaginationState } from '@/pages/electrical/useElecCalcPaginationState';
import { useElecCalcPreferenceSettings } from '@/pages/electrical/useElecCalcPreferenceSettings';
import { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import { useElecCalcRowClassName } from '@/pages/electrical/useElecCalcRowClassName';
import { useElecCalcRowSelectionState } from '@/pages/electrical/useElecCalcRowSelectionState';
import { useElecCalcSelectedRowsClipboardEffect } from '@/pages/electrical/useElecCalcSelectedRowsClipboardEffect';
import { useElecCalcTableProjection } from '@/pages/electrical/useElecCalcTableProjection';
import { useElecCalcTableDimensions } from '@/pages/electrical/useElecCalcTableDimensions';
import { useElecCalcTableNavigation } from '@/pages/electrical/useElecCalcTableNavigation';
import { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';

const { Text } = Typography;
const ElectricalGlideGrid = lazy(() => import('@/components/electrical/ElectricalGlideGrid'));
const ElectricalCandidateGlideGrid = lazy(() => import('@/components/electrical/ElectricalCandidateGlideGrid'));

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const location = useLocation();
  const {
    availableCableTypeKeys,
    availableCableTypes,
    electricalGlideEnabled,
    electricalCandidateGlideEnabled,
    navigationActiveJobId,
  } = useElecCalcBootViewState({
    commercialFeaturesAvailable,
    location,
  });
  const storedVariant = useCalculationVariantStore((s) =>
    project?.id ? s.variantByProject[project.id] : undefined
  );
  const saveVariant = useCalculationVariantStore((s) => s.setVariant);
  const variant = normalizeCalculationVariant(storedVariant);
  const setVariant = useCallback(
    (nextVariant: number) => {
      if (project?.id) saveVariant(project.id, nextVariant);
    },
    [project?.id, saveVariant],
  );

  const { values: recalc, setters: setRecalc } = useElecCalcRecalculationParams();
  const {
    tablePage,
    tablePageSize,
    electricalPageCursor,
    electricalInfinitePages,
    setTablePage,
    setTablePageSize,
    resetTablePage,
    resetPaginationCache,
    resetTablePageAndCursors,
    rememberElectricalPage,
    rememberNextCursor,
    loadNextElectricalGlidePage,
  } = useElecCalcPaginationState();
  const {
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    editingCandidateFolder,
    closeCandidateFolderModal,
    openCreateCandidateFolderModal,
    openRenameCandidateFolderModal,
  } = useElecCalcCandidateFolderUiState();
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [candidateColumnSettingsOpen, setCandidateColumnSettingsOpen] = useState(false);
  const {
    tableColumnSettings,
    setTableColumnSettings,
    candidateTableColumnSettings,
    setCandidateTableColumnSettings,
    tableViewSettings,
    setTableViewSettings,
    updateTableColumnPreference,
    updateCandidateTableColumnPreference,
    updateTableSettingsPreference,
  } = useElecCalcPreferenceSettings({
    isRegisteredUser,
    registeredUserId,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
  });
  const {
    normalizedTableViewSettings,
    visibleElectricalColumnMetas,
    visibleCandidateColumnMetas,
    resolvedTableFontSize,
    visibleElectricalColumnKeys,
    visibleCandidateColumnKeys,
  } = useElecCalcColumnViewModel({
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
  });
  const {
    tableViewState,
    candidateTableViewState,
    setTableViewState,
    setCandidateTableViewState,
    currentTableViewActive,
    candidateTableViewActive,
    setColumnFilter,
    resetColumnFilter,
    resetCurrentTableViewState,
    setElectricalTableSort,
    setCandidateColumnFilter,
    resetCandidateColumnFilter,
    resetCandidateTableViewState,
    setCandidateTableSort,
  } = useElecCalcTableViewState({
    visibleElectricalColumnKeys,
    visibleCandidateColumnKeys,
    resetElectricalTablePage: resetTablePage,
  });
  const cableSource: CableSource = isEmployee
    ? tableViewSettings.calculationCableSource
    : 'builtin';
  const effectiveSource: CableSource = commercialFeaturesAvailable ? cableSource : 'builtin';
  const [overwriteManualChoices, setOverwriteManualChoices] = useState(false);
  const tableScrollRegionsRef = useRef<HTMLDivElement | null>(null);
  useFocusableTableScrollRegions(
    tableScrollRegionsRef,
    'Таблица электротехнического расчёта',
    Boolean(project),
  );

  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: electricalQueryCapabilities } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query-capabilities', variant],
    queryFn: () => getElectricalQueryCapabilities(project!.id, variant),
    enabled: !!project,
    staleTime: 60_000,
  });
  const electricalQueryRequest = useMemo(
    () => (project
      ? buildElectricalQueryRequest(
        project.id,
        variant,
        cableSource,
        tableViewState,
        tablePage,
        tablePageSize,
        electricalQueryCapabilities,
        electricalPageCursor,
      )
      : null),
    [
      electricalPageCursor,
      electricalQueryCapabilities,
      project,
      cableSource,
      tablePage,
      tablePageSize,
      tableViewState,
      variant,
    ],
  );
  const {
    data: electricalPage,
    isFetching: isElectricalPageFetching,
    isPlaceholderData: isElectricalPagePlaceholderData,
  } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query', electricalQueryRequest],
    queryFn: () => queryElectrical(electricalQueryRequest!),
    enabled: !!project && electricalQueryRequest != null && !!electricalQueryCapabilities,
    placeholderData: (previous) => previous,
  });
  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;
  const nextElectricalPageCursor = pageInfo?.next_cursor;
  const {
    objects,
    elecCalcs,
    electricalDisplayOffset,
    stats,
  } = useElecCalcTableProjection({
    electricalGlideEnabled,
    electricalPage,
    electricalInfinitePages,
    isElectricalPagePlaceholderData,
    tablePage,
  });
  const {
    activeRowId,
    selectedRowKeys,
    setSelectedRowKeys,
    activateRowId,
    openElectricalRow,
  } = useElecCalcRowSelectionState({
    projectId: project?.id,
    variant,
    tablePage,
    tablePageSize,
    objects,
  });
  const cableTypes = useElecCalcCableTypeState({
    availableCableTypes,
    calcByObjectId: stats.calcByObjectId,
    selectedRowKeys,
    projectId: project?.id,
    variant,
  });
  const {
    activeJob,
    activeJobId,
    setActiveJobId,
    setActiveBatchScope,
    batchMut,
    copyVariantMut,
    cancelJobMut,
  } = useElecCalcBatchJobOrchestration({
    initialActiveJobId: navigationActiveJobId,
    projectId: project?.id,
    variant,
    effectiveSource,
    recalc,
    selectedCableType: cableTypes.selectedCableType,
    defaultCableType: cableTypes.defaultCableType,
    cableTypeForRecalculation: cableTypes.cableTypeForRecalculation,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    objectOverridesForIds: cableTypes.objectOverridesForIds,
    setCableTypeDraftByObjectId: cableTypes.setCableTypeDraftByObjectId,
    resetTablePageAndCursors,
    setSelectedRowKeys,
    setVariant,
  });

  useElecCalcPageScopeEffects({
    projectId: project?.id,
    variant,
    effectiveSource,
    tablePageSize,
    tableViewState,
    navigationActiveJobId,
    resetTablePage,
    resetPaginationCache,
    setActiveJobId,
    setActiveBatchScope,
  });

  const cableSizingModal = useElecCalcCableSizingModalState({
    projectId: project?.id,
    variant,
    objects,
    calcByObjectId: stats.calcByObjectId,
    recalc,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
  });
  const {
    objectId: cableSizingModalObjectId,
    mode: cableSizingMode,
    setMode: setCableSizingMode,
    cableType: cableSizingCableType,
    setCableType: setCableSizingCableType,
    manualMark: cableSizingManualMark,
    setManualMark: setCableSizingManualMark,
    effectiveCableType: cableSizingEffectiveCableType,
    candidateParams: cableSizingCandidateParams,
    candidatesQueryKey: cableSizingCandidatesQueryKey,
    candidateFoldersQueryKey: cableSizingCandidateFoldersQueryKey,
    object: cableSizingModalObject,
    calc: cableSizingModalCalc,
    resetModalState: resetCableSizingModalState,
    openModalState: openCableSizingModalState,
  } = cableSizingModal;

  useElecCalcDataLifecycleEffects({
    electricalGlideEnabled,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    rememberElectricalPage,
    cableSizingModalObjectId,
    resetCandidateTableViewState,
    setCableSizingCableType,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    nextElectricalPageCursor,
    rememberNextCursor,
  });

  const { data: cables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables(effectiveSource, 'self_regulating'),
    queryFn: () => listCables(effectiveSource, 'self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: builtinCables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables('builtin', 'self_regulating'),
    queryFn: () => listCables('builtin', 'self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: ttCables = [] } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables(effectiveSource),
    queryFn: () => getResistiveCables(effectiveSource),
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: builtinResistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables('builtin'),
    queryFn: () => getResistiveCables('builtin'),
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });

  const {
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
  } = useElecCalcCableCatalogView({
    availableCableTypes,
    cables,
    builtinCables,
    ttCables,
    resistiveCables,
    builtinResistiveCables,
    effectiveSource,
    visibleCableTypeControl: cableTypes.visibleCableTypeControl,
  });

  const {
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  } = useElecCalcCableMarkOptions({
    availableCableTypes,
    cables,
    builtinCables,
    ttCables,
    resistiveCables,
    builtinResistiveCables,
    effectiveSource,
    aggressiveProduct: recalc.aggressiveProduct,
    cableSizingEffectiveCableType,
  });
  const setElectricalQueryCalculation = useCallback((calculation: ElectricalCalcSummary) => {
    if (!project?.id) return;
    qc.setQueriesData<ElectricalQueryResponse>(
      { queryKey: ['project', project.id, 'electrical-query'] },
      (current) => {
        if (!current) return current;
        const replaced = current.calculations.some((calc) =>
          calc.object_id === calculation.object_id &&
          calc.variant_number === calculation.variant_number,
        );
        const calculations = replaced
          ? current.calculations.map((calc) =>
              calc.object_id === calculation.object_id &&
              calc.variant_number === calculation.variant_number
                ? calculation
                : calc)
          : [...current.calculations, calculation];
        return { ...current, calculations };
      },
    );
  }, [project?.id, qc]);
  const {
    createCandidateMut,
    updateCandidateMut,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    deleteCandidateFolderMut,
    toggleCandidateFolderItemMut,
    applyCandidateMut,
    submitCandidateFolderModal,
  } = useElecCalcCandidateMutationFlow({
    projectId: project?.id,
    variant,
    effectiveSource,
    cableSizingModalObjectId,
    cableSizingEffectiveCableType,
    cableSizingCandidateParams,
    cableSizingCandidatesQueryKey,
    cableSizingCandidateFoldersQueryKey,
    candidateFolderName,
    candidateFolderModalMode,
    editingCandidateFolder,
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    closeCandidateFolderModal,
    setElectricalQueryCalculation,
  });
  const manualCableMut = useMutation({
    mutationFn: async ({
      objectId,
      mark,
      cableType,
      cableSource,
      targetVariants,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
      cableSource?: CableSource;
      targetVariants: CalculationVariant[];
    }) => {
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const effectiveCableType = cableTypes.normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        mark,
        cableSource ?? effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
        },
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      const targetLabel = calculationVariantLabel(variables.targetVariants);
      message.success(`Кабель выбран, расчёт обновлён${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const autoCableMut = useMutation({
    mutationFn: async ({
      objectId,
      cableType,
      targetVariants,
    }: {
      objectId: string;
      cableType: CableTypeKey;
      targetVariants: CalculationVariant[];
    }) => {
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const effectiveCableType = cableTypes.normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        null,
        effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
        },
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      const targetLabel = calculationVariantLabel(variables.targetVariants);
      message.success(`Автоподбор выполнен${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const electricalLayoutMut = useMutation({
    mutationFn: async ({
      objectId,
      cableMark,
      cableSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    }: {
      objectId: string;
      cableMark: string | null;
      cableSource: CableSource;
      cableType: CableTypeKey;
      windingPitchMm: number | null;
      numberOfThreads: number | null;
    }) => {
      const effectiveCableType = cableTypes.normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        cableMark,
        cableSource,
        [variant],
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          windingPitchMm,
          numberOfThreads,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
        },
      );
    },
    onSuccess: (calculations) => {
      calculations.forEach(setElectricalQueryCalculation);
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Параметры укладки сохранены, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const manualCableMutate = manualCableMut.mutate;
  const autoCableMutate = autoCableMut.mutate;
  const electricalLayoutMutate = electricalLayoutMut.mutate;
  const isCableMarkPending = manualCableMut.isPending || autoCableMut.isPending || electricalLayoutMut.isPending;
  const {
    data: cableSizingCandidates = [],
    isFetching: isCableSizingCandidatesFetching,
  } = useQuery({
    queryKey: cableSizingCandidatesQueryKey,
    queryFn: () =>
      listElectricalCandidates(project!.id, cableSizingModalObjectId!, variant),
    enabled: !!project && !!cableSizingModalObjectId,
  });
  const { data: cableSizingCandidateFolders = [] } = useQuery({
    queryKey: cableSizingCandidateFoldersQueryKey,
    queryFn: () =>
      listElectricalCandidateFolders(project!.id, cableSizingModalObjectId!, variant),
    enabled: !!project && !!cableSizingModalObjectId,
  });
  const {
    activeCustomCandidateFolder,
    candidatesByActiveFolder: cableSizingCandidatesByActiveFolder,
    candidateFolderCounts,
  } = useElecCalcCandidateFolderViewModel({
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidates: cableSizingCandidates,
    candidateFolders: cableSizingCandidateFolders,
  });
  const candidateCompare = useElecCalcCandidateCompareState({
    candidatesByActiveFolder: cableSizingCandidatesByActiveFolder,
    candidateTableViewState,
    visibleCandidateColumnMetas,
    resetKey: activeCandidateFolderKey,
  });
  const {
    markedCandidateIds: markedCableSizingCandidateIds,
    markedCandidateSet: markedCableSizingCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCandidates: resetMarkedCableSizingCandidates,
    toggleCandidateMarked: toggleCableSizingCandidateMark,
    toggleCandidateMarkedByRow: toggleElectricalCandidateGlideMarked,
    displayedCandidates: displayedCableSizingCandidates,
    displayedMarkedCandidates: displayedMarkedCableSizingCandidates,
    compareActive: cableSizingCandidateCompareActive,
    diffColumnKeys: candidateCompareDiffColumnKeys,
    isCompareDiffCell: isCandidateCompareDiffCell,
    candidateRowClassName: cableSizingCandidateRowClassName,
  } = candidateCompare;
  const appliedCableSizingCandidate = useMemo(
    () => cableSizingCandidates.find((candidate) => candidate.is_applied) ?? null,
    [cableSizingCandidates],
  );

  const findCableRowForMark = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
    selectedSource?: CableSource | null,
  ): CableStatusRow | null => resolveCableRowForMark({
    type,
    mark,
    calc,
    rows: cableRowsForType(type),
    selectedSource,
  }), [cableRowsForType]);

  const cableSizingModalSelectedCable = useMemo<CableStatusRow | null>(() => (
    cableSizingEffectiveCableType
      ? findCableRowForMark(
          cableSizingEffectiveCableType,
          cableSizingManualMark ?? getCableMark(cableSizingModalCalc),
          cableSizingModalCalc,
          catalogSourceFromSnapshot(cableSizingModalCalc),
        )
      : null
  ), [
    cableSizingEffectiveCableType,
    cableSizingManualMark,
    cableSizingModalCalc,
    findCableRowForMark,
  ]);
  const cableMarkValueForCalc = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
  ) => {
    if (!mark) return AUTO_CABLE_MARK_VALUE;
    if (shouldShowProjectCableOption(calc)) return cableMarkOptionValue('project', mark);
    const savedSource = catalogSourceFromSnapshot(calc);
    const manualOptions = manualCableOptionsForType(type);
    const matchingOption = manualOptions.find((option) =>
      option.mark === mark && (!savedSource || option.cableSource === savedSource))
      ?? manualOptions.find((option) => option.mark === mark);
    return matchingOption?.value ?? cableMarkOptionValue(savedSource ?? effectiveSource, mark);
  }, [effectiveSource, manualCableOptionsForType]);
  const cableMarkModal = useElecCalcCableMarkModalState({
    objects,
    calcByObjectId: stats.calcByObjectId,
    variant,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    cableMarkOptionsFor,
    cableMarkValueForCalc,
    findCableRowForMark,
    onOpenObject: (object) => activateRowId(object.id),
    onCableTypeChange: () => setRecalc.connectionType('line_1ph'),
  });
  const {
    object: cableMarkModalObject,
    cableType: cableMarkModalCableType,
    value: cableMarkModalValue,
    setValue: setCableMarkModalValue,
    targetVariants: cableMarkModalTargetVariants,
    targetVariantsForSubmit: cableMarkModalTargetVariantsForSubmit,
    options: cableMarkModalOptions,
    optionByValue: cableMarkModalOptionByValue,
    selectedCable: cableMarkModalSelectedCable,
    targetVariantOptions: cableMarkModalTargetVariantOptions,
    close: closeCableMarkModal,
    open: openCableMarkModal,
    changeCableType: changeCableMarkModalCableType,
    normalizeSelectedCableType: normalizeCableMarkModalCableType,
    setTargetVariantsFromValues: setCableMarkModalTargetVariantsFromValues,
  } = cableMarkModal;

  useEffect(() => {
    normalizeCableMarkModalCableType();
  }, [normalizeCableMarkModalCableType]);

  const closeCableSizingModal = useCallback(() => {
    resetCableSizingModalState();
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
    closeCandidateFolderModal();
    setCandidateColumnSettingsOpen(false);
  }, [closeCandidateFolderModal, resetCableSizingModalState, resetMarkedCableSizingCandidates]);
  const openCableSizingModal = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
    openCableSizingModalState(obj);
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
  }, [
    activateRowId,
    openCableSizingModalState,
    resetMarkedCableSizingCandidates,
  ]);
  const applyCableMarkModal = useCallback(() => {
    if (!cableMarkModalObject || !cableMarkModalCableType) return;
    const targetVariants = cableMarkModalTargetVariantsForSubmit;
    const selectedMark = cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE;
    if (selectedMark === AUTO_CABLE_MARK_VALUE) {
      autoCableMutate({
        objectId: cableMarkModalObject.id,
        cableType: cableMarkModalCableType,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
    } else {
      const selectedOption = cableMarkModalOptionByValue.get(selectedMark);
      if (!selectedOption?.mark) return;
      manualCableMutate({
        objectId: cableMarkModalObject.id,
        mark: selectedOption.mark,
        cableType: cableMarkModalCableType,
        cableSource: selectedOption.cableSource,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
    }
  }, [
    autoCableMutate,
    cableMarkModalCableType,
    cableMarkModalObject,
    cableMarkModalOptionByValue,
    cableMarkModalTargetVariantsForSubmit,
    cableMarkModalValue,
    closeCableMarkModal,
    manualCableMutate,
  ]);

  const {
    fieldCapabilityByKey,
    enumOptionsByColumn,
    candidateEnumOptionsByColumn,
  } = useElecCalcFilterOptions({
    electricalFields: electricalQueryCapabilities?.fields,
    cableSizingCandidates,
    visibleCandidateColumnMetas,
    candidateColumnValueAccessors,
  });

  const {
    handleElectricalTableChange,
    handleCandidateTableChange,
  } = useElecCalcAntTableHandlers({
    setTablePage,
    setTablePageSize,
    setTableViewState,
    setCandidateTableViewState,
  });

  const electricalColumnRenderers = useElecCalcElectricalColumnRenderers({
    activeRowId,
    calcByObjectId: stats.calcByObjectId,
    electricalDisplayOffset,
    getCalculatedCableTypeForObject: cableTypes.getCalculatedCableTypeForObject,
    isCableMarkPending,
    projectSelected: Boolean(project),
    recalc,
    openCableMarkModal,
    openCableSizingModal,
  });

  const {
    persistCandidateTableColumnSettings,
    persistTableSettings,
    applyElectricalGlideColumnDraftWidth,
    commitElectricalGlideColumnWidth,
    applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth,
    startColumnResize,
    startCandidateColumnResize,
  } = useElecCalcColumnPersistence({
    tableColumnSettings,
    candidateTableColumnSettings,
    isRegisteredUser,
    registeredUserId,
    setTableColumnSettings,
    setCandidateTableColumnSettings,
    setTableViewSettings,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    updateTableColumnPreference: updateTableColumnPreference.mutate,
    updateCandidateTableColumnPreference: updateCandidateTableColumnPreference.mutate,
    updateTableSettingsPreference: updateTableSettingsPreference.mutate,
  });

  const {
    draftTableColumnSettings,
    draftCandidateTableColumnSettings,
    draftTableViewSettings,
    openColumnSettings,
    openCandidateColumnSettings,
    updateDraftColumn,
    updateDraftColumnOrder,
    reorderDraftColumn,
    updateDraftColumnWidth,
    updateDraftTableFontSize,
    resetDraftTableFontSize,
    updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat,
    resetDraftLabelFormats,
    updateDraftCalculationCableSource,
    resetDraftColumnWidth,
    resetDraftColumns,
    selectAllDraftColumns,
    applyColumnSettings,
    updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth,
    resetDraftCandidateColumns,
    selectAllDraftCandidateColumns,
    applyCandidateColumnSettings,
  } = useElecCalcColumnSettingsDraftState({
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
    isEmployee,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    persistTableSettings,
    persistCandidateTableColumnSettings,
  });

  const electricalColumns = useElecCalcElectricalColumns({
    visibleElectricalColumnMetas,
    electricalColumnRenderers,
    fieldCapabilityByKey,
    enumOptionsByColumn,
    tableViewState,
    onColumnResizeStart: startColumnResize,
    onSetColumnFilter: setColumnFilter,
    onResetColumnFilter: resetColumnFilter,
  });

  const getElectricalGlideColumnAlign = useCallback(
    (key: ElectricalColumnKey) => electricalColumnRenderers[key]?.align,
    [electricalColumnRenderers],
  );
  const {
    electricalGlideColumns,
    candidateGlideColumnMetaByKey,
    electricalCandidateGlideColumns,
  } = useElecCalcGlideColumnModel({
    visibleElectricalColumnMetas,
    fieldCapabilityByKey,
    enumOptionsByColumn,
    getElectricalColumnAlign: getElectricalGlideColumnAlign,
    visibleCandidateColumnMetas,
    candidateEnumOptionsByColumn,
  });

  const electricalColumnCopyValue = useElecCalcElectricalColumnCopyValue({
    calcByObjectId: stats.calcByObjectId,
    electricalDisplayOffset,
    getCableTypeForObject: cableTypes.getCalculatedCableTypeForObject,
    layingStep: recalc.layingStep,
    heatingHeight: recalc.heatingHeight,
    connectionType: recalc.connectionType,
    supplyVoltage: recalc.supplyVoltage,
    windingCoefficient: recalc.windingCoefficient,
    vaporTemperature: recalc.vaporTemperature,
    maintainTemperature: recalc.maintainTemperature,
    aggressiveProduct: recalc.aggressiveProduct,
  });

  const isElectricalLayoutCellEditable = useCallback((obj: ProjectObject, columnKey: string) => {
    return resolveElectricalLayoutCellEditable({
      obj,
      columnKey,
      projectSelected: Boolean(project),
      isCableMarkPending,
      calcByObjectId: stats.calcByObjectId,
      getCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    });
  }, [cableTypes.getSavedCableTypeForObject, isCableMarkPending, project, stats.calcByObjectId]);

  const {
    getElectricalGlideCellActions,
    handleElectricalGlideCellAction,
  } = useElecCalcGlideActions({
    activeRowId,
    projectSelected: Boolean(project),
    isCableMarkPending,
    onOpenCableMarkModal: openCableMarkModal,
    onOpenCableSizingModal: openCableSizingModal,
  });

  const getElectricalGlideCellState = useElecCalcGlideCellState({
    calcByObjectId: stats.calcByObjectId,
    electricalColumnCopyValue,
    isElectricalLayoutCellEditable,
    getColumnAlign: getElectricalGlideColumnAlign,
    getCellActions: getElectricalGlideCellActions,
  });

  const handleElectricalGlideStartCellEdit = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
  }, [activateRowId]);

  const handleElectricalGlideCommitCell = useCallback((
    obj: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    const validation = validateElectricalLayoutCellCommit({
      obj,
      columnKey,
      value,
      projectSelected: Boolean(project),
      calcByObjectId: stats.calcByObjectId,
      getCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    });
    if (validation.status === 'ignored') return null;
    if (validation.status === 'error') return validation.error;

    const markSource = getCableMarkSource(validation.calc);
    electricalLayoutMutate({
      objectId: obj.id,
      cableMark: markSource === 'manual' ? validation.mark : null,
      cableSource: markSource === 'manual'
        ? catalogSourceFromSnapshot(validation.calc) ?? effectiveSource
        : effectiveSource,
      cableType: validation.cableType,
      windingPitchMm: validation.windingPitchMm,
      numberOfThreads: validation.numberOfThreads,
    });
    return null;
  }, [
    effectiveSource,
    electricalLayoutMutate,
    cableTypes.getSavedCableTypeForObject,
    project,
    stats.calcByObjectId,
  ]);

  useElecCalcSelectedRowsClipboardEffect({
    electricalColumnCopyValue,
    objects,
    selectedRowKeys,
    visibleElectricalColumnMetas,
  });

  const {
    electricalTableScrollX,
    electricalTableScrollY,
  } = useElecCalcTableDimensions({
    visibleElectricalColumnMetas,
  });

  const electricalRowClassName = useElecCalcRowClassName({
    activeRowId,
    calcByObjectId: stats.calcByObjectId,
  });

  const cablePickerModalTitle = (
    <div className="electrical-cable-picker-title">
      <span className="electrical-cable-picker-title-text">Выбор марки кабеля</span>
      {cableMarkModalObject && (
        <>
          <span className="electrical-cable-picker-title-for">для</span>
          <span className="electrical-cable-picker-title-object">
            {objectDisplayName(cableMarkModalObject)}
          </span>
        </>
      )}
    </div>
  );

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const {
    electricalPagination,
    electricalInfiniteLoading,
    handleElectricalGlidePageChange,
    handleElectricalGlideLoadMore,
  } = useElecCalcTableNavigation({
    tablePage,
    tablePageSize,
    totalObjects,
    filteredCount: electricalPage?.counts?.filtered,
    electricalGlideEnabled,
    loadedObjectsCount: objects.length,
    hasNextPage: Boolean(pageInfo?.has_next_page),
    nextElectricalPageCursor,
    isElectricalPageFetching,
    setTablePage,
    loadNextElectricalGlidePage,
  });
  const activeJobStatus = activeJob?.status ?? null;
  const {
    validObjectsCount,
    selectedValidObjectsCount,
    selectedHeatLossFailedCount,
    calculatedCount,
    failedCount,
    totalCableLength,
    totalCurrent,
    manualCableCount,
    selectedManualCableCount,
    summaryPowerDisplay,
    bannerStats,
    isJobActive,
    selectedRecalcDisabled,
    selectedRecalcTooltip,
    selectedRecalcCountLabel,
    jobProgressLabel,
    sourceVariantCalculationCount,
    projectObjectsForCopyCount,
  } = useMemo(
    () => buildElecCalcSummaryViewModel({
      pageSummary,
      objects,
      elecCalcsCount: elecCalcs.length,
      selectedRowKeys,
      stats,
      activeJobStatus,
      jobProgress: activeJob?.progress,
    }),
    [
      activeJob?.progress,
      activeJobStatus,
      elecCalcs.length,
      objects,
      pageSummary,
      selectedRowKeys,
      stats,
    ],
  );
  const renderManualOverwriteControl = useCallback((manualCount: number): ReactNode => {
    if (manualCount <= 0) return null;
    return (
      <>
        <Text type="secondary">
          Найдено ручных выборов: {manualCount}. По умолчанию они будут сохранены и пропущены.
        </Text>
        <Checkbox
          checked={overwriteManualChoices}
          onChange={(event) => setOverwriteManualChoices(event.target.checked)}
        >
          Перезаписать ручные выборы ({manualCount})
        </Checkbox>
      </>
    );
  }, [overwriteManualChoices]);
  const electricalErrorItems = useMemo(
    () => buildElectricalErrorItems({
      objects,
      calcByObjectId: stats.calcByObjectId,
      electricalDisplayOffset,
    }),
    [electricalDisplayOffset, objects, stats.calcByObjectId],
  );
  const activeElectricalErrorItem = useMemo(
    () => resolveActiveElectricalErrorItem({
      activeRowId,
      objects,
      calcByObjectId: stats.calcByObjectId,
      electricalDisplayOffset,
      electricalErrorItems,
    }),
    [activeRowId, electricalDisplayOffset, electricalErrorItems, objects, stats.calcByObjectId],
  );
  const activeElectricalErrorGuidance = useMemo(
    () => electricalErrorGuidanceForItem(activeElectricalErrorItem),
    [activeElectricalErrorItem],
  );
  const bannerCableTypeLabel = cableTypes.selectedCableTypesMixed
    ? 'смешанные типы'
    : cableTypes.selectedCableType
      ? CABLE_TYPE_LABEL[cableTypes.selectedCableType]
      : 'тип по объектам';
  const cableTypeControlLabel = 'Тип для пересчёта:';
  const {
    getElectricalCandidateGlideCellActions,
    handleElectricalCandidateGlideCellAction,
    candidateFolderMenuItems,
    getElectricalCandidateGlideActionMenuItems,
  } = useElecCalcCandidateGlideActions({
    candidateFolders: cableSizingCandidateFolders,
    applyCandidatePending: applyCandidateMut.isPending,
    updateCandidatePending: updateCandidateMut.isPending,
    toggleCandidateFolderItemPending: toggleCandidateFolderItemMut.isPending,
    onApplyCandidate: applyCandidateMut.mutate,
    onUpdateCandidate: updateCandidateMut.mutate,
    onToggleCandidateFolderItem: toggleCandidateFolderItemMut.mutate,
  });
  const getElectricalCandidateGlideColumnAlign = useCallback(
    (columnKey: string) => candidateGlideColumnMetaByKey.get(columnKey)?.align,
    [candidateGlideColumnMetaByKey],
  );
  const getElectricalCandidateGlideCellState = useElecCalcCandidateGlideCellState({
    markedCandidateSet: markedCableSizingCandidateSet,
    candidateCompareActive: cableSizingCandidateCompareActive,
    diffColumnKeys: candidateCompareDiffColumnKeys,
    getColumnAlign: getElectricalCandidateGlideColumnAlign,
    getCellActions: getElectricalCandidateGlideCellActions,
  });

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const cableTypeOptions = availableCableTypeKeys.map((k) => ({
    label: commercialFeaturesAvailable
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Расширенные типы кабеля закрыты feature flag">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
  }));
  const cableSourceOptions: Array<{ label: string; value: ElectricalCalculationCableSource }> = [
    { label: 'Встроенная', value: 'builtin' },
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as ElectricalCalculationCableSource },
          { label: 'Все', value: 'all' as ElectricalCalculationCableSource },
        ]
      : []),
  ];
  const copyVariantMenuItems = [1, 2, 3, 4]
    .filter((targetVariant) => targetVariant !== variant)
    .map((targetVariant) => ({
      key: String(targetVariant),
      label: `Скопировать СО${variant} в СО${targetVariant}`,
      disabled: copyVariantMut.isPending || isJobActive,
    }));

  function showCopyVariantConfirm(targetVariant: number) {
    Modal.confirm({
      title: `Создать СО${targetVariant} на основании СО${variant}?`,
      content: (
        <Space direction="vertical" size={6}>
          <Text>
            Скопируются {sourceVariantCalculationCount} объектов с расчётами в СО{variant}.
          </Text>
          {sourceVariantCalculationCount < projectObjectsForCopyCount && (
            <Text type="secondary">
              В проекте объектов: {projectObjectsForCopyCount}. Остальные в СО{targetVariant}
              {' '}останутся не рассчитаны.
            </Text>
          )}
          <Text type="secondary">
            Система проверит скопированные марки на текущих данных, но не заменит их более
            оптимальным кабелем.
          </Text>
        </Space>
      ),
      okText: 'Создать',
      cancelText: 'Отмена',
      onOk: () => copyVariantMut.mutate({ targetVariant }),
    });
  }

  function renderElectricalTypeControls(
    cableType: CableTypeKey | null = cableTypes.visibleCableTypeControl,
    options: { block?: boolean } = {},
  ) {
    return (
      <ElecCalcElectricalTypeControls
        cableType={cableType}
        block={options.block}
        recalc={recalc}
        setRecalc={setRecalc}
      />
    );
  }

  function renderRecalculationSettings() {
    return (
      <ElecCalcRecalculationSettings
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        isEmployee={isEmployee}
        calculationCableSource={draftTableViewSettings.calculationCableSource}
        cableSourceOptions={cableSourceOptions}
        selectionPolicy={recalc.selectionPolicy}
        commercialDataStatus={commercialDataStatus}
        technicalDataStatus={technicalDataStatus}
        onCalculationCableSourceChange={updateDraftCalculationCableSource}
        onSelectionPolicyChange={setRecalc.selectionPolicy}
      />
    );
  }

  function showDeleteCandidateFolderConfirm(folder: ElectricalCandidateFolder) {
    Modal.confirm({
      title: `Удалить папку «${folder.name}»?`,
      content: 'Варианты останутся в списке. Удалится только фильтр-папка.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteCandidateFolderMut.mutate(folder.id),
    });
  }

  function candidateFolderEmptyText() {
    if (activeCandidateFolderKey === 'favorite') return 'В избранном пока нет вариантов';
    if (activeCustomCandidateFolder) return 'В этой папке пока нет вариантов';
    return 'Вариантов пока нет. Запустите авторасчёт или ручной расчёт.';
  }

  const cableSizingCandidateColumns = useElecCalcCandidateColumns({
    visibleCandidateColumnMetas,
    candidateTableViewState,
    candidateEnumOptionsByColumn,
    markedCandidateIds: markedCableSizingCandidateIds,
    applyCandidatePending: applyCandidateMut.isPending,
    applyingCandidateId: applyCandidateMut.variables,
    updateCandidatePending: updateCandidateMut.isPending,
    toggleCandidateFolderItemPending: toggleCandidateFolderItemMut.isPending,
    onCandidateColumnResizeStart: startCandidateColumnResize,
    onSetCandidateColumnFilter: setCandidateColumnFilter,
    onResetCandidateColumnFilter: resetCandidateColumnFilter,
    isCandidateCompareDiffCell,
    onToggleCandidateMark: toggleCableSizingCandidateMark,
    onApplyCandidate: applyCandidateMut.mutate,
    onUpdateCandidate: updateCandidateMut.mutate,
    candidateFolderMenuItems,
  });
  const cableSizingCandidateTableScrollX = Math.max(
    920,
    visibleCandidateColumnMetas.reduce(
      (sum, column) => sum + Math.max(column.width, column.minWidthPx),
      0,
    ),
  );

  return (
    <>
      <div ref={tableScrollRegionsRef}>
        <Space direction="vertical" size={5} style={{ width: '100%' }}>

        {/* Summary banner */}
        <div className="common-data-banner">
          <span>
            <span className="label">СО{variant} · {bannerCableTypeLabel} · </span>
            {bannerStats}
          </span>
        </div>
        {failedCount > 0 && (
          <div className="electrical-error-summary" aria-label="Сообщения ошибок электрорасчёта">
            <div className="electrical-error-summary__header">
              <Tag color="error" icon={<CloseCircleFilled />}>
                Ошибок: {failedCount}
              </Tag>
            </div>
            {activeElectricalErrorItem?.error ? (
              <div className="electrical-error-summary__record">
                <Tooltip title={activeElectricalErrorItem.error}>
                  <Text type="secondary" ellipsis className="electrical-error-summary__message">
                    {activeElectricalErrorItem.error}
                  </Text>
                </Tooltip>
                {activeElectricalErrorItem.fallback && (
                  <Text type="secondary" className="electrical-error-summary__hint">
                    Показана первая ошибка на текущей странице. Выберите строку, чтобы переключить сообщение.
                  </Text>
                )}
                {activeElectricalErrorGuidance && (
                  <div className="electrical-error-summary__suggestions" aria-label="Предложения по исправлению ошибки">
                    <Tag color={activeElectricalErrorGuidance.tagColor} className="electrical-error-summary__kind">
                      {activeElectricalErrorGuidance.label}
                    </Tag>
                    <Text type="secondary" className="electrical-error-summary__suggestion-label">
                      Что попробовать:
                    </Text>
                    {activeElectricalErrorGuidance.suggestions.map((suggestion) => (
                      <Tag key={suggestion} className="electrical-error-summary__suggestion-tag">
                        {suggestion}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            ) : !activeRowId && !activeElectricalErrorItem ? (
              <Text type="secondary" className="electrical-error-summary__empty">
                Ошибки есть вне текущей страницы таблицы.
              </Text>
            ) : null}
          </div>
        )}

        <ElectricalBatchActionBar
          variant={variant}
          cableTypeControlLabel={cableTypeControlLabel}
          cableTypeOptions={cableTypeOptions}
          visibleCableTypeControl={cableTypes.visibleCableTypeControl}
          typeControls={renderElectricalTypeControls()}
          commercialFeaturesAvailable={commercialFeaturesAvailable}
          copyVariantMenuItems={copyVariantMenuItems}
          copyVariantPending={copyVariantMut.isPending}
          isJobActive={isJobActive}
          selectedManualCableCount={selectedManualCableCount}
          selectedValidObjectsCount={selectedValidObjectsCount}
          selectedHeatLossFailedCount={selectedHeatLossFailedCount}
          manualCableCount={manualCableCount}
          overwriteManualChoices={overwriteManualChoices}
          selectedRecalcDisabled={selectedRecalcDisabled}
          selectedRecalcTooltip={selectedRecalcTooltip}
          selectedRecalcCountLabel={selectedRecalcCountLabel}
          batchPending={batchMut.isPending}
          validObjectsCount={validObjectsCount}
          cableTypeForRecalculation={cableTypes.cableTypeForRecalculation}
          activeJobId={activeJobId}
          cancelJobPending={cancelJobMut.isPending}
          currentTableViewActive={currentTableViewActive}
          renderManualOverwriteControl={renderManualOverwriteControl}
          onVariantChange={(nextVariant) => {
            resetTablePage();
            setVariant(nextVariant);
          }}
          onCopyVariant={showCopyVariantConfirm}
          onCableTypeChange={(next) => {
            const nextType = cableTypes.normalizeAvailableCableType(next);
            if (selectedRowKeys.length === 0) {
              cableTypes.setDefaultCableType(nextType);
            } else {
              cableTypes.setCableTypeDraftByObjectId((prev) => {
                const nextDrafts = { ...prev };
                for (const objectId of selectedRowKeys) {
                  if (nextType === cableTypes.getSavedCableTypeForObject(objectId)) {
                    delete nextDrafts[objectId];
                  } else {
                    nextDrafts[objectId] = nextType;
                  }
                }
                return nextDrafts;
              });
            }
            setRecalc.connectionType('line_1ph');
          }}
          onManualOverwritePromptOpen={() => setOverwriteManualChoices(false)}
          onRecalculateSelected={(skipManual) =>
            batchMut.mutate({
              scope: 'selected',
              objectIds: selectedRowKeys,
              skipManual,
            })}
          onRecalculateAll={(skipManual) =>
            batchMut.mutate({
              scope: 'all',
              skipManual,
            })}
          onCancelJob={() => cancelJobMut.mutate()}
          onOpenColumnSettings={openColumnSettings}
          onResetFilters={resetCurrentTableViewState}
        />

        {isJobActive && (
          <Alert
            type="info"
            showIcon
            message={`Электрорасчёт выполняется · ${jobProgressLabel}`}
          />
        )}

        {/* Table */}
        <Card size="small" className="workspace-table-card srs-table-wrap">
          {electricalPage && totalObjects === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Нет объектов"
              description="Добавьте объекты на шаге «Теплопотери»."
              style={{ margin: 12 }}
            />
          ) : electricalGlideEnabled ? (
            <Suspense fallback={null}>
              <ElectricalGlideGrid
                rows={objects}
                gridColumns={electricalGlideColumns}
                tableScrollX={electricalTableScrollX}
                tableScrollY={electricalTableScrollY}
                fontSizeKey={resolvedTableFontSize.key}
                activeRowId={activeRowId}
                selectedRowKeys={selectedRowKeys}
                tableViewState={tableViewState}
                pagination={electricalPagination}
                infiniteLoading={electricalInfiniteLoading}
                emptyContent={currentTableViewActive && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : undefined}
                rowClassName={electricalRowClassName}
                getCellState={getElectricalGlideCellState}
                onOpenRow={openElectricalRow}
                onSelectedRowKeysChange={setSelectedRowKeys}
                onSetColumnFilter={setColumnFilter}
                onResetColumnFilter={resetColumnFilter}
                onSetSort={setElectricalTableSort}
                onColumnResize={applyElectricalGlideColumnDraftWidth}
                onColumnResizeEnd={commitElectricalGlideColumnWidth}
                onPageChange={handleElectricalGlidePageChange}
                onLoadMore={handleElectricalGlideLoadMore}
                onCellAction={handleElectricalGlideCellAction}
                onStartCellEdit={handleElectricalGlideStartCellEdit}
                onCommitCell={handleElectricalGlideCommitCell}
              />
            </Suspense>
          ) : (
            <Table<ProjectObject>
              className={`calc-spreadsheet calc-spreadsheet--${resolvedTableFontSize.key} electrical-spreadsheet`}
              rowKey="id"
              size="small"
              loading={isElectricalPageFetching}
              pagination={electricalPagination}
              dataSource={objects}
              onChange={handleElectricalTableChange}
              scroll={{ x: electricalTableScrollX }}
              rowClassName={electricalRowClassName}
              onRow={(obj) => ({
                onClick: (event) => {
                  if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
                  activateRowId(obj.id);
                },
              })}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
                columnWidth: 36,
              }}
              columns={electricalColumns}
              locale={{
                emptyText: currentTableViewActive && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : undefined,
              }}
            />
          )}

          {/* Legend / summary row */}
          <div className="legend-row-srs">
            <span>
              ⓘ Красная строка = ошибка подбора кабеля, серый статус = не применимо.
              Отметьте строки для пересчёта выбранных или используйте «Пересчитать все».
            </span>
            {calculatedCount > 0 && (
              <Space size={16}>
                <Text style={{ fontSize: 12 }}>
                  Кабель: <strong>{totalCableLength.toFixed(1)} м</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Мощность: <strong>{summaryPowerDisplay}</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Ток: <strong>{totalCurrent.toFixed(2)} А</strong>
                </Text>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={() => navigate(ROUTES.specification)}
                >
                  Спецификация →
                </Button>
              </Space>
            )}
          </div>
        </Card>

        </Space>
      </div>
      <Modal
        open={!!cableMarkModalObject}
        width="min(92vw, 1056px)"
        className="electrical-cable-picker-dialog"
        style={{ top: 28 }}
        title={cablePickerModalTitle}
        okText="Применить"
        cancelText="Отмена"
        confirmLoading={isCableMarkPending}
        okButtonProps={{
          disabled: !cableMarkModalObject?.is_valid
            || !cableMarkModalValue
            || cableMarkModalTargetVariants.length === 0,
        }}
        onOk={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {cableMarkModalObject && (
            <CablePickerCharacteristics
              object={cableMarkModalObject}
              cable={cableMarkModalSelectedCable}
              cableType={cableMarkModalCableType}
            />
          )}
          {cableMarkModalCableType && (
            <div>
              <Text type="secondary">Тип кабеля</Text>
              <Select<CableTypeKey>
                aria-label="Тип кабеля для выбора марки"
                size="small"
                value={cableMarkModalCableType}
                disabled={isCableMarkPending || !commercialFeaturesAvailable}
                onChange={changeCableMarkModalCableType}
                options={cableTypeOptions}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
          )}
          {cableMarkModalCableType && renderElectricalTypeControls(cableMarkModalCableType, { block: true })}
          <div>
            <Text type="secondary">Марка</Text>
            <Select
              autoFocus
              showSearch
              value={cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE}
              options={cableMarkModalOptions}
              optionFilterProp="searchLabel"
              disabled={!cableMarkModalObject?.is_valid || !project}
              loading={isCableMarkPending}
              notFoundContent="Нет доступных марок"
              style={{ width: '100%', marginTop: 4 }}
              onChange={setCableMarkModalValue}
            />
          </div>
          <div>
            <Text type="secondary">Сохранить в СО</Text>
            <Checkbox.Group
              aria-label="СО для сохранения выбора марки"
              options={cableMarkModalTargetVariantOptions}
              value={cableMarkModalTargetVariants}
              disabled={isCableMarkPending}
              onChange={setCableMarkModalTargetVariantsFromValues}
              style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            «Авто» запустит автоподбор для выбранных СО. Выбор конкретной марки сохранит ручной
            подбор в отмеченных СО.
          </Text>
        </Space>
      </Modal>
      <Modal
        open={!!cableSizingModalObject}
        width="100vw"
        style={{ top: 0, maxWidth: 'none', paddingBottom: 0 }}
        className="electrical-cable-picker-dialog electrical-cable-sizing-dialog"
        title={cableSizingModalObject ? `Подбор кабеля для ${objectDisplayName(cableSizingModalObject)}` : 'Подбор'}
        footer={null}
        onCancel={closeCableSizingModal}
      >
        <div className="electrical-cable-sizing-body">
          {cableSizingModalObject && (
            <CablePickerCharacteristics
              object={cableSizingModalObject}
              cable={cableSizingModalSelectedCable}
              cableType={cableSizingEffectiveCableType}
              showCable={false}
              objectColumnCount={4}
            />
          )}
          <div className="electrical-cable-sizing-controls">
            <Segmented<'auto' | 'manual'>
              aria-label="Режим подбора кабеля"
              size="small"
              value={cableSizingMode}
              onChange={setCableSizingMode}
              options={[
                { label: 'Авторасчёт', value: 'auto' },
                { label: 'Ручной расчёт', value: 'manual' },
              ]}
            />
            <Select<CableTypeKey>
              aria-label="Тип кабеля для подбора"
              size="small"
              value={cableSizingEffectiveCableType}
              disabled={!commercialFeaturesAvailable}
              onChange={(nextType) => {
                setCableSizingCableType(cableTypes.normalizeAvailableCableType(nextType));
                setCableSizingManualMark(null);
                setRecalc.connectionType('line_1ph');
              }}
              options={cableTypeOptions}
              style={{ minWidth: 220 }}
            />
            {cableSizingMode === 'manual' && (
              <Select
                aria-label="Марка ручного кандидата"
                showSearch
                size="small"
                value={cableSizingManualMark ?? undefined}
                placeholder="Марка"
                options={cableSizingManualOptions
                  .filter((option) => option.mark)
                  .map((option) => ({
                    ...option,
                    value: option.mark!,
                  }))}
                optionFilterProp="searchLabel"
                style={{ minWidth: 280 }}
                onChange={setCableSizingManualMark}
              />
            )}
            <Button
              size="small"
              type="primary"
              loading={createCandidateMut.isPending}
              disabled={
                !cableSizingModalObject ||
                (cableSizingMode === 'manual' && !cableSizingManualMark)
              }
              onClick={() => createCandidateMut.mutate({
                mode: cableSizingMode,
                mark: cableSizingManualMark,
              })}
            >
              {cableSizingMode === 'auto' ? 'Запустить авторасчёт' : 'Рассчитать вариант'}
            </Button>
            <Button
              size="small"
              icon={<TableOutlined />}
              aria-label="Настройки таблицы"
              onClick={() => openCandidateColumnSettings()}
            >
              Настройки таблицы
            </Button>
            <Button
              size="small"
              icon={<CloseCircleOutlined />}
              aria-label="Сбросить фильтры таблицы кандидатов"
              disabled={!candidateTableViewActive}
              onClick={resetCandidateTableViewState}
            >
              Сбросить фильтры
            </Button>
          </div>
          {renderElectricalTypeControls(cableSizingEffectiveCableType, { block: true })}
          <ElecCalcSelectedCableSummary
            appliedCandidate={appliedCableSizingCandidate}
            calc={cableSizingModalCalc}
            fallbackCableType={cableSizingCableType}
          />
          <ElecCalcCandidateFolderTabs
            activeKey={activeCandidateFolderKey}
            counts={candidateFolderCounts}
            folders={cableSizingCandidateFolders}
            onSelectFolder={setActiveCandidateFolderKey}
            onCreateFolder={openCreateCandidateFolderModal}
            onRenameFolder={openRenameCandidateFolderModal}
            onDeleteFolder={showDeleteCandidateFolderConfirm}
          />
          <ElecCalcCandidateCompareBar
            active={cableSizingCandidateCompareActive}
            markedCount={displayedMarkedCableSizingCandidates.length}
            diffCount={candidateCompareDiffColumnKeys.size}
            onReset={resetMarkedCableSizingCandidates}
          />
          {electricalCandidateGlideEnabled ? (
            <Suspense fallback={null}>
              <ElectricalCandidateGlideGrid
                rows={displayedCableSizingCandidates}
                gridColumns={electricalCandidateGlideColumns}
                tableScrollX={cableSizingCandidateTableScrollX}
                tableScrollY="calc(100vh - 332px)"
                fontSizeKey={resolvedTableFontSize.key}
                loading={isCableSizingCandidatesFetching}
                tableViewState={candidateTableViewState}
                emptyContent={candidateFolderEmptyText()}
                rowClassName={cableSizingCandidateRowClassName}
                getCellState={getElectricalCandidateGlideCellState}
                onToggleMarked={toggleElectricalCandidateGlideMarked}
                onCellAction={handleElectricalCandidateGlideCellAction}
                getActionMenuItems={getElectricalCandidateGlideActionMenuItems}
                onSetColumnFilter={setCandidateColumnFilter}
                onResetColumnFilter={resetCandidateColumnFilter}
                onSetSort={setCandidateTableSort}
                onColumnResize={applyElectricalCandidateGlideColumnDraftWidth}
                onColumnResizeEnd={commitElectricalCandidateGlideColumnWidth}
              />
            </Suspense>
          ) : (
            <Table<ElectricalCandidate>
              className="electrical-cable-sizing-table"
              size="small"
              rowKey="id"
              onRow={(candidate) => ({
                'data-testid': `candidate-row-${candidate.id}`,
              }) as HTMLAttributes<HTMLElement>}
              rowClassName={cableSizingCandidateRowClassName}
              loading={isCableSizingCandidatesFetching}
              dataSource={displayedCableSizingCandidates}
              columns={cableSizingCandidateColumns}
              onChange={handleCandidateTableChange}
              pagination={false}
              scroll={{ x: cableSizingCandidateTableScrollX, y: 'calc(100vh - 332px)' }}
              locale={{
                emptyText: candidateFolderEmptyText(),
              }}
            />
          )}
          <Input.TextArea
            aria-label="Комментарий к выбранному кандидату"
            size="small"
            rows={2}
            maxLength={2000}
            placeholder="Комментарий инженера к выбранному варианту"
            disabled={!cableSizingCandidates.find((candidate) => candidate.is_applied)}
            defaultValue={
              cableSizingCandidates.find((candidate) => candidate.is_applied)?.engineer_comment ?? ''
            }
            onBlur={(event) => {
              const applied = cableSizingCandidates.find((candidate) => candidate.is_applied);
              if (!applied) return;
              const nextComment = event.currentTarget.value;
              if ((applied.engineer_comment ?? '') === nextComment) return;
              updateCandidateMut.mutate({
                candidateId: applied.id,
                patch: { engineer_comment: nextComment },
              });
            }}
          />
        </div>
      </Modal>
      <Modal
        open={candidateFolderModalOpen}
        title={candidateFolderModalMode === 'rename' ? 'Переименовать папку' : 'Новая папка'}
        okText={candidateFolderModalMode === 'rename' ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        confirmLoading={createCandidateFolderMut.isPending || updateCandidateFolderMut.isPending}
        okButtonProps={{ disabled: candidateFolderName.trim().length === 0 }}
        onOk={submitCandidateFolderModal}
        onCancel={closeCandidateFolderModal}
      >
        <Input
          autoFocus
          maxLength={64}
          value={candidateFolderName}
          placeholder="Название папки"
          aria-label="Название папки вариантов"
          onChange={(event) => setCandidateFolderName(event.target.value)}
          onPressEnter={submitCandidateFolderModal}
        />
      </Modal>
      {candidateColumnSettingsOpen && (
        <ElectricalCandidateColumnSettingsModal
          open={candidateColumnSettingsOpen}
          settings={draftCandidateTableColumnSettings}
          settingsLabelFormat={normalizedTableViewSettings.settingsLabelFormat}
          confirmLoading={updateCandidateTableColumnPreference.isPending}
          onOk={applyCandidateColumnSettings}
          onCancel={() => setCandidateColumnSettingsOpen(false)}
          onSelectAllColumns={selectAllDraftCandidateColumns}
          onResetColumns={resetDraftCandidateColumns}
          onVisibleChange={updateDraftCandidateColumn}
          onOrderChange={updateDraftCandidateColumnOrder}
          onColumnReorder={reorderDraftCandidateColumn}
          onWidthChange={updateDraftCandidateColumnWidth}
          onResetWidth={resetDraftCandidateColumnWidth}
        />
      )}
      {columnSettingsOpen && (
        <ElectricalColumnSettingsModal
          open={columnSettingsOpen}
          settings={draftTableColumnSettings}
          viewSettings={draftTableViewSettings}
          confirmLoading={
            updateTableColumnPreference.isPending || updateTableSettingsPreference.isPending
          }
          onOk={applyColumnSettings}
          onCancel={() => setColumnSettingsOpen(false)}
          onSelectAllColumns={selectAllDraftColumns}
          onResetColumns={resetDraftColumns}
          onVisibleChange={updateDraftColumn}
          onOrderChange={updateDraftColumnOrder}
          onColumnReorder={reorderDraftColumn}
          onWidthChange={updateDraftColumnWidth}
          onResetWidth={resetDraftColumnWidth}
          onFontSizeChange={updateDraftTableFontSize}
          onTableLabelFormatChange={updateDraftTableLabelFormat}
          onSettingsLabelFormatChange={updateDraftSettingsLabelFormat}
          onResetFontSize={resetDraftTableFontSize}
          onResetLabelFormats={resetDraftLabelFormats}
          recalculationSettings={renderRecalculationSettings()}
        />
      )}
    </>
  );
}
