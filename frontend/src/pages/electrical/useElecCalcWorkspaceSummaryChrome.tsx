/**
 * @module electrical/workspace-summary-chrome
 * @owner electrical
 * Summary counters, batch recalc actions, error summary, manual-overwrite control.
 */
import { useCallback, useMemo, type ReactNode } from 'react';

import type { ElectricalStats } from '@/hooks/useElectricalStats';
import {
  buildElecCalcSummaryViewModel,
} from '@/pages/electrical/elecCalcSummaryModel';
import {
  ELEC_CALC_CABLE_TYPE_CONTROL_LABEL,
  resolveActiveJobStatus,
  resolveTotalObjectsCount,
} from '@/pages/electrical/elecCalcWorkspaceSummaryChromeModel';
import { ElecCalcManualOverwriteControl } from '@/pages/electrical/ElecCalcManualOverwriteControl';
import {
  useElecCalcBatchRecalcActions,
  type BatchRecalcMutateArgs,
} from '@/pages/electrical/useElecCalcBatchRecalcActions';
import { useElecCalcErrorSummaryState } from '@/pages/electrical/useElecCalcErrorSummaryState';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type {
  CalculationTaskProgress,
  CalculationTaskStatus,
  ElectricalCalcSummary,
  ElectricalPageSummary,
  ElectricalQueryAssignment,
} from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

export type UseElecCalcWorkspaceSummaryChromeArgs = {
  pageSummary?: ElectricalPageSummary;
  objects: ProjectObject[];
  elecCalcsCount: number;
  compatibleSelectedRowKeys: readonly string[];
  stats: ElectricalStats;
  activeJob: {
    status?: CalculationTaskStatus | null;
    progress?: CalculationTaskProgress | null;
  } | null | undefined;
  activeJobId: string | null | undefined;
  canMutate: boolean;
  overwriteManualChoices: boolean;
  setOverwriteManualChoices: (value: boolean) => void;
  electricalDisplayOffset: number;
  activeRowId: string | null;
  selectedRowKeys: readonly string[];
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  cableTypeForRecalculation: CableTypeKey | null | undefined;
  mutateBatch: (args: BatchRecalcMutateArgs) => void;
  cancelJob: () => void;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
};

export function useElecCalcWorkspaceSummaryChrome({
  pageSummary,
  objects,
  elecCalcsCount,
  compatibleSelectedRowKeys,
  stats,
  activeJob,
  activeJobId,
  canMutate,
  overwriteManualChoices,
  setOverwriteManualChoices,
  electricalDisplayOffset,
  activeRowId,
  selectedRowKeys,
  assignmentByObjectId,
  cableTypeForRecalculation,
  mutateBatch,
  cancelJob,
  calcByObjectId,
}: UseElecCalcWorkspaceSummaryChromeArgs) {
  const activeJobStatus = resolveActiveJobStatus(
    activeJob,
    activeJobId,
  ) as CalculationTaskStatus | null;

  const summary = useMemo(
    () => buildElecCalcSummaryViewModel({
      pageSummary,
      objects,
      elecCalcsCount,
      selectedRowKeys: compatibleSelectedRowKeys,
      stats,
      activeJobStatus,
      jobProgress: activeJob?.progress,
    }),
    [
      activeJob?.progress,
      activeJobStatus,
      elecCalcsCount,
      objects,
      pageSummary,
      compatibleSelectedRowKeys,
      stats,
    ],
  );
  // Same rule as summary.totalObjects; explicit for navigation call-sites.
  const totalObjects = resolveTotalObjectsCount(
    pageSummary?.total_objects,
    objects.length,
  );

  const renderManualOverwriteControl = useCallback((manualCount: number): ReactNode => (
    <ElecCalcManualOverwriteControl
      manualCount={manualCount}
      canMutate={canMutate}
      overwriteManualChoices={overwriteManualChoices}
      onOverwriteChange={setOverwriteManualChoices}
    />
  ), [canMutate, overwriteManualChoices, setOverwriteManualChoices]);

  const {
    activeElectricalErrorItem,
    activeElectricalErrorGuidance,
  } = useElecCalcErrorSummaryState({
    objects,
    calcByObjectId,
    electricalDisplayOffset,
    activeRowId,
  });

  const {
    onRecalculateSelected,
    onRecalculateAll,
    onRecalculateObjectIds,
    onCancelJob,
  } = useElecCalcBatchRecalcActions({
    canMutate,
    selectedRowKeys,
    assignmentByObjectId,
    cableTypeForRecalculation,
    mutateBatch,
    cancelJob,
  });

  return {
    ...summary,
    totalObjects,
    renderManualOverwriteControl,
    activeElectricalErrorItem,
    activeElectricalErrorGuidance,
    onRecalculateSelected,
    onRecalculateAll,
    onRecalculateObjectIds,
    onCancelJob,
    cableTypeControlLabel: ELEC_CALC_CABLE_TYPE_CONTROL_LABEL,
  };
}
