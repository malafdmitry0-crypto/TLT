import type { ElectricalStats } from '@/hooks/useElectricalStats';
import type { ElectricalSystemSummaries } from '@/components/electrical/ElectricalSummary';
import {
  countManualCableRows,
  countValidSelectedObjects,
  formatSelectedRecalcCountLabel,
  objectIdsForSelection,
  selectedObjectsForKeys,
  selectedRecalcDisabledTooltip,
} from '@/pages/electrical/elecCalcSelectionModel';
import type {
  CalculationTaskProgress,
  CalculationTaskStatus,
  ElectricalPageSummary,
} from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { isActiveCalcJobStatus } from '@/utils/calcJobPolling';

function toSystemSummaries(pageSummary: ElectricalPageSummary): ElectricalSystemSummaries | undefined {
  const summaries = pageSummary.system_summaries;
  if (!summaries) return undefined;
  const bucket = (value: typeof summaries.total) => ({
    objectCount: value.object_count,
    cableLengthM: value.cable_length_m,
    sectionCount: value.section_count,
    powerW: value.power_w,
    startCurrentA: value.start_current_a,
    workingCurrentA: value.working_current_a,
  });
  return {
    self_regulating: bucket(summaries.self_regulating),
    resistive: bucket(summaries.resistive),
    skin: bucket(summaries.skin),
    total: bucket(summaries.total),
  };
}

type ElecCalcSummaryViewModelOptions = {
  pageSummary?: ElectricalPageSummary;
  objects: readonly ProjectObject[];
  elecCalcsCount: number;
  selectedRowKeys: readonly string[];
  stats: ElectricalStats;
  activeJobStatus: CalculationTaskStatus | null;
  jobProgress?: CalculationTaskProgress | null;
};

export function buildElecCalcSummaryViewModel({
  pageSummary,
  objects,
  elecCalcsCount,
  selectedRowKeys,
  stats,
  activeJobStatus,
  jobProgress,
}: ElecCalcSummaryViewModelOptions) {
  const systemSummaries = pageSummary ? toSystemSummaries(pageSummary) ?? stats.systemSummaries : stats.systemSummaries;
  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const validObjectsCount = pageSummary?.valid_objects ?? stats.validObjects.length;
  const selectedObjectsCount = selectedRowKeys.length;
  const selectedObjects = selectedObjectsForKeys(objects, selectedRowKeys);
  const selectedValidObjectsCount = countValidSelectedObjects(selectedObjects);
  const selectedHeatLossFailedCount = selectedObjectsCount - selectedValidObjectsCount;
  const calculatedCount = pageSummary?.calculated_count ?? stats.calcedCount;
  const failedCount = pageSummary?.failed_count ?? stats.failedCount;
  const totalCableLength = pageSummary?.total_cable_length ?? stats.totalCableLength;
  const totalPower = pageSummary?.total_power ?? stats.totalPower;
  const totalCurrent = pageSummary?.total_current ?? stats.totalCurrent;
  const visibleManualCableCount = countManualCableRows(
    objectIdsForSelection(objects),
    stats.calcByObjectId,
  );
  const manualCableCount = pageSummary?.manual_cable_mark_count ?? visibleManualCableCount;
  const selectedManualCableCount = countManualCableRows(selectedRowKeys, stats.calcByObjectId);
  const showSummaryInKW = totalPower >= 1000;
  const summaryPowerDisplay = showSummaryInKW
    ? `${(totalPower / 1000).toFixed(2)} кВт`
    : `${totalPower.toFixed(0)} Вт`;
  const bannerStats = calculatedCount > 0
    ? `${totalCableLength.toFixed(1)} м · ${summaryPowerDisplay} · ${totalCurrent.toFixed(2)} А · рассчитано: ${calculatedCount}/${totalObjects}`
    : 'расчёт не выполнен';
  const isJobActive = isActiveCalcJobStatus(activeJobStatus);
  const selectedRecalcDisabled = selectedValidObjectsCount === 0 || isJobActive;
  const selectedRecalcTooltip = selectedRecalcDisabledTooltip(
    selectedObjectsCount,
    selectedValidObjectsCount,
  );
  const selectedRecalcCountLabel = formatSelectedRecalcCountLabel(
    selectedObjectsCount,
    selectedValidObjectsCount,
  );
  const jobProgressLabel = jobProgress?.total
    ? `${jobProgress.current}/${jobProgress.total}`
    : activeJobStatus ?? '';
  const sourceVariantCalculationCount =
    pageSummary?.electrical_calculations_total ?? elecCalcsCount;

  return {
    totalObjects,
    validObjectsCount,
    selectedObjectsCount,
    selectedValidObjectsCount,
    selectedHeatLossFailedCount,
    calculatedCount,
    failedCount,
    totalCableLength,
    totalPower,
    totalCurrent,
    totalSections: pageSummary?.total_sections ?? systemSummaries.total.sectionCount,
    totalStartCurrentA: pageSummary?.total_start_current_a ?? systemSummaries.total.startCurrentA,
    systemSummaries,
    visibleManualCableCount,
    manualCableCount,
    selectedManualCableCount,
    showSummaryInKW,
    summaryPowerDisplay,
    bannerStats,
    isJobActive,
    selectedRecalcDisabled,
    selectedRecalcTooltip,
    selectedRecalcCountLabel,
    jobProgressLabel,
    sourceVariantCalculationCount,
    projectObjectsForCopyCount: totalObjects,
  };
}
