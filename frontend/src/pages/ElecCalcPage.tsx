import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ReactNode,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from 'antd';
import {
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  getElectricalQueryCapabilities,
  queryElectrical,
  type CableSource,
} from '@/api/calculations';
import { useAuthStore } from '@/store/authStore';
import {
  normalizeCalculationVariant,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import ElectricalBatchActionBar from '@/pages/electrical/ElectricalBatchActionBar';
import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import ElecCalcCableSizingModal from '@/pages/electrical/ElecCalcCableSizingModal';
import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';
import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import ElecCalcParamsPanel from '@/pages/electrical/ElecCalcParamsPanel';
import ElecCalcRecalculationSettings from '@/pages/electrical/ElecCalcRecalculationSettings';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';
import type {
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
  buildElectricalQueryRequest,
} from '@/pages/electrical/elecCalcQueryModel';
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
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import {
  getCableMark,
  getCableMarkSource,
} from '@/pages/electrical/elecCalcResultValueModel';
import { useElecCalcAntTableHandlers } from '@/pages/electrical/useElecCalcAntTableHandlers';
import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';
import { useElecCalcCableReferenceData } from '@/pages/electrical/useElecCalcCableReferenceData';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import { useElecCalcBatchJobOrchestration } from '@/pages/electrical/useElecCalcBatchJobOrchestration';
import { useElecCalcCandidateGlideActions } from '@/pages/electrical/useElecCalcCandidateGlideActions';
import { useElecCalcCandidateState } from '@/pages/electrical/useElecCalcCandidateState';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
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
import { readStorageJson } from '@/utils/storage';

const ELECCALC_PARAMS_PANEL_STORAGE_KEY = 'tlt-eleccalc-params-panel';

const { Text } = Typography;
const ElectricalGlideGrid = lazy(() => import('@/components/electrical/ElectricalGlideGrid'));
const ElectricalCandidateColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalCandidateColumnSettingsModal'),
);
const ElectricalColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalColumnSettingsModal'),
);

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
    navigationActiveJobId,
  } = useElecCalcBootViewState({
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
  // Блок заполнения параметров (аналог SC-03); пока виден — компактные
  // контролы в тулбаре скрываются, чтобы не дублировать одни и те же поля.
  const [paramsPanelVisible, setParamsPanelVisible] = useState<boolean>(
    () => readStorageJson(ELECCALC_PARAMS_PANEL_STORAGE_KEY) !== false,
  );
  const toggleParamsPanel = useCallback((visible: boolean) => {
    setParamsPanelVisible(visible);
    try {
      localStorage.setItem(ELECCALC_PARAMS_PANEL_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // localStorage может быть недоступен — настройка останется на сессию
    }
  }, []);
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
    setCableType: setCableSizingCableType,
    manualMark: cableSizingManualMark,
    effectiveCableType: cableSizingEffectiveCableType,
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

  const {
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  } = useElecCalcCableReferenceData({
    projectSelected: Boolean(project),
    commercialFeaturesAvailable,
    availableCableTypes,
    effectiveSource,
    visibleCableTypeControl: cableTypes.visibleCableTypeControl,
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
  const candidate = useElecCalcCandidateState({
    projectId: project?.id,
    variant,
    effectiveSource,
    setElectricalQueryCalculation,
    cableSizingModal,
    candidateTableViewState,
    visibleCandidateColumnMetas,
  });
  const {
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    closeCandidateFolderModal,
    updateCandidateMut,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    deleteCandidateFolderMut,
    toggleCandidateFolderItemMut,
    applyCandidateMut,
    submitCandidateFolderModal,
    cableSizingCandidates,
    cableSizingCandidateFolders,
    activeCustomCandidateFolder,
    markedCableSizingCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCableSizingCandidates,
    cableSizingCandidateCompareActive,
    candidateCompareDiffColumnKeys,
  } = candidate;

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

  const {
    electricalLayoutMutate,
    isCableMarkPending,
    applyCableMarkModal,
  } = useElecCalcCableSelectionMutationFlow({
    projectId: project?.id,
    variant,
    effectiveSource,
    recalc,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    setElectricalQueryCalculation,
    cableMarkModalObject,
    cableMarkModalCableType,
    cableMarkModalValue,
    cableMarkModalTargetVariantsForSubmit,
    cableMarkModalOptionByValue,
    closeCableMarkModal,
  });

  useEffect(() => {
    normalizeCableMarkModalCableType();
  }, [normalizeCableMarkModalCableType]);

  const closeCableSizingModal = useCallback(() => {
    resetCableSizingModalState();
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
    closeCandidateFolderModal();
    setCandidateColumnSettingsOpen(false);
  }, [
    closeCandidateFolderModal,
    resetCableSizingModalState,
    resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey,
  ]);
  const openCableSizingModal = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
    openCableSizingModalState(obj);
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
  }, [
    activateRowId,
    openCableSizingModalState,
    resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey,
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
  } = useElecCalcAntTableHandlers({
    setTablePage,
    setTablePageSize,
    setTableViewState,
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
  const cableTypeOptions = useMemo(() => availableCableTypeKeys.map((k) => ({
    label: CABLE_TYPE_LABEL[k],
    value: k,
  })), [availableCableTypeKeys]);
  const cableSourceOptions = useMemo<Array<{ label: string; value: ElectricalCalculationCableSource }>>(() => [
    { label: 'Встроенная', value: 'builtin' },
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as ElectricalCalculationCableSource },
          { label: 'Все', value: 'all' as ElectricalCalculationCableSource },
        ]
      : []),
  ], [isEmployee]);
  const copyVariantMenuItems = useMemo(() => [1, 2, 3, 4]
    .filter((targetVariant) => targetVariant !== variant)
    .map((targetVariant) => ({
      key: String(targetVariant),
      label: `Скопировать СО${variant} в СО${targetVariant}`,
      disabled: copyVariantMut.isPending || isJobActive,
    })), [copyVariantMut.isPending, isJobActive, variant]);
  const defaultElectricalTypeControls = useMemo(() => (
    <ElecCalcElectricalTypeControls
      cableType={cableTypes.visibleCableTypeControl}
      recalc={recalc}
      setRecalc={setRecalc}
    />
  ), [cableTypes.visibleCableTypeControl, recalc, setRecalc]);
  const cableSizingCandidateTableScrollX = useMemo(() => Math.max(
    920,
    visibleCandidateColumnMetas.reduce(
      (sum, column) => sum + Math.max(column.width, column.minWidthPx),
      0,
    ),
  ), [visibleCandidateColumnMetas]);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

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

  function handleCableTypeControlChange(next: CableTypeKey) {
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

  return (
    <>
      <div ref={tableScrollRegionsRef}>
        <Space direction="vertical" size={5} style={{ width: '100%' }}>

        {/* Summary banner */}
        <div
          className="common-data-banner"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <span>
            <span className="label">СО{variant} · {bannerCableTypeLabel} · </span>
            {bannerStats}
          </span>
          <Checkbox
            className="actionbar-form-toggle"
            checked={paramsPanelVisible}
            onChange={(event) => toggleParamsPanel(event.target.checked)}
          >
            Показать блок заполнения параметров
          </Checkbox>
        </div>

        {paramsPanelVisible && (
          <ElecCalcParamsPanel
            cableType={cableTypes.visibleCableTypeControl}
            cableTypeOptions={cableTypeOptions}
            onCableTypeChange={handleCableTypeControlChange}
            recalc={recalc}
            setRecalc={setRecalc}
          />
        )}
        <ElecCalcErrorSummary
          failedCount={failedCount}
          activeRowId={activeRowId}
          item={activeElectricalErrorItem}
          guidance={activeElectricalErrorGuidance}
        />

        <ElectricalBatchActionBar
          variant={variant}
          cableTypeControlLabel={cableTypeControlLabel}
          cableTypeOptions={cableTypeOptions}
          visibleCableTypeControl={cableTypes.visibleCableTypeControl}
          typeControls={paramsPanelVisible ? null : defaultElectricalTypeControls}
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
          onCableTypeChange={handleCableTypeControlChange}
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
      <ElecCalcCableMarkModal
        object={cableMarkModalObject}
        selectedCable={cableMarkModalSelectedCable}
        cableType={cableMarkModalCableType}
        cableTypeOptions={cableTypeOptions}
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        projectSelected={Boolean(project)}
        pending={isCableMarkPending}
        value={cableMarkModalValue}
        markOptions={cableMarkModalOptions}
        targetVariants={cableMarkModalTargetVariants}
        targetVariantOptions={cableMarkModalTargetVariantOptions}
        renderTypeControls={(nextCableType) =>
          renderElectricalTypeControls(nextCableType, { block: true })}
        onCableTypeChange={changeCableMarkModalCableType}
        onMarkChange={setCableMarkModalValue}
        onTargetVariantsChange={setCableMarkModalTargetVariantsFromValues}
        onApply={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      />
      <ElecCalcCableSizingModal
        cableSizingModal={cableSizingModal}
        candidate={candidate}
        selectedCable={cableSizingModalSelectedCable}
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        cableTypeOptions={cableTypeOptions}
        cableSizingManualOptions={cableSizingManualOptions}
        candidateTableScrollX={cableSizingCandidateTableScrollX}
        candidateFontSizeKey={resolvedTableFontSize.key}
        electricalCandidateGlideColumns={electricalCandidateGlideColumns}
        candidateTableViewState={candidateTableViewState}
        candidateTableViewActive={candidateTableViewActive}
        normalizeAvailableCableType={cableTypes.normalizeAvailableCableType}
        onClose={closeCableSizingModal}
        onResetConnectionType={() => setRecalc.connectionType('line_1ph')}
        onOpenCandidateColumnSettings={openCandidateColumnSettings}
        onResetCandidateTableViewState={resetCandidateTableViewState}
        renderTypeControls={renderElectricalTypeControls}
        candidateFolderEmptyText={candidateFolderEmptyText}
        onDeleteCandidateFolder={showDeleteCandidateFolderConfirm}
        getCandidateCellState={getElectricalCandidateGlideCellState}
        onCandidateCellAction={handleElectricalCandidateGlideCellAction}
        getCandidateActionMenuItems={getElectricalCandidateGlideActionMenuItems}
        onSetCandidateColumnFilter={setCandidateColumnFilter}
        onResetCandidateColumnFilter={resetCandidateColumnFilter}
        onSetCandidateSort={setCandidateTableSort}
        onCandidateColumnResize={applyElectricalCandidateGlideColumnDraftWidth}
        onCandidateColumnResizeEnd={commitElectricalCandidateGlideColumnWidth}
      />
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      {columnSettingsOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </>
  );
}
