import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Space } from 'antd';
import { useLocation } from 'react-router-dom';
import { TltAlert } from '@/components/ui-kit';

import {
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import ElectricalVariantTabs, {
  electricalVariantPanelId,
  electricalVariantTabId,
} from '@/pages/electrical/ElectricalVariantTabs';
import type { ElectricalNavigationState } from '@/pages/electrical/elecCalcPageModel';
import { useElectricalVariantSelection } from '@/pages/electrical/useElectricalVariantSelection';
import {
  useElectricalBatchJobTracker,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import { ElecCalcWorkspace } from '@/pages/electrical/ElecCalcWorkspace';
import type {
  ElectricalSpecificationReadinessSnapshot,
} from '@/pages/electrical/electricalSpecificationReadinessModel';

export default function ElecCalcProject({
  projectId,
  canMutate,
}: {
  projectId: string;
  canMutate: boolean;
}) {
  const location = useLocation();
  const controller = useElectricalVariantSelection({ projectId });
  const {
    registerJob,
    registerJobId,
    trackedJobs,
    completionByVariant,
  } = useElectricalBatchJobTracker(projectId);
  const registeredNavigationJobIdsRef = useRef(new Set<string>());
  const setLegacyVariant = useCalculationVariantStore((state) => state.setVariant);
  const clearLegacyVariant = useCalculationVariantStore((state) => state.clearVariant);
  const selectedVariant = controller.selectedVariant;
  const [assignmentReadinessReport, setAssignmentReadinessReport] = useState<{
    electricalVariantId: string;
    snapshot: ElectricalSpecificationReadinessSnapshot;
  } | null>(null);
  const [assignmentDataEpoch, setAssignmentDataEpoch] = useState(0);
  const markAssignmentDataChanged = useCallback(() => {
    setAssignmentReadinessReport(null);
    setAssignmentDataEpoch((current) => current + 1);
  }, []);
  const handleAssignmentReadinessChange = useCallback((
    electricalVariantId: string,
    snapshot: ElectricalSpecificationReadinessSnapshot,
  ) => {
    setAssignmentReadinessReport({ electricalVariantId, snapshot });
  }, []);
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState | null | undefined)?.activeJobId ?? null;

  useEffect(() => {
    if (!navigationActiveJobId || !selectedVariant) return;
    if (registeredNavigationJobIdsRef.current.has(navigationActiveJobId)) return;
    registeredNavigationJobIdsRef.current.add(navigationActiveJobId);
    registerJobId(navigationActiveJobId, {
      projectId,
      electricalVariantId: selectedVariant.id,
      electricalVariantName: selectedVariant.name,
      scope: 'all',
    });
  }, [
    navigationActiveJobId,
    projectId,
    registerJobId,
    selectedVariant,
  ]);

  useEffect(() => {
    const legacyVariantNumber = selectedVariant?.legacy_variant_number;
    if (legacyVariantNumber == null) {
      clearLegacyVariant(projectId);
      return;
    }
    setLegacyVariant(projectId, legacyVariantNumber);
  }, [clearLegacyVariant, projectId, selectedVariant?.legacy_variant_number, setLegacyVariant]);

  const selectedAssignmentReadiness = assignmentReadinessReport
    && assignmentReadinessReport.electricalVariantId === selectedVariant?.id
    ? assignmentReadinessReport.snapshot
    : null;

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <ElectricalVariantTabs
        controller={controller}
        canMutate={canMutate}
        assignmentReadiness={selectedAssignmentReadiness}
      />
      {selectedVariant?.legacy_variant_number == null && selectedVariant && (
        <div
          id={electricalVariantPanelId(selectedVariant.id)}
          role="tabpanel"
          aria-labelledby={electricalVariantTabId(selectedVariant.id)}
        >
          <TltAlert
            tone="warning"
            title={`«${selectedVariant.name}»: расчётные действия временно недоступны`}
          >
            <span>
              Для этого ЭР ещё нет UUID-совместимого расчётного контура. Расчёт, кандидаты,
              спецификация и отчёт отключены; данные другого ЭР не подставляются.
            </span>
          </TltAlert>
        </div>
      )}
      {selectedVariant?.legacy_variant_number != null && (
        <div
          id={electricalVariantPanelId(selectedVariant.id)}
          role="tabpanel"
          aria-labelledby={electricalVariantTabId(selectedVariant.id)}
        >
          <ElecCalcWorkspace
            key={`${selectedVariant.id}:${assignmentDataEpoch}`}
            projectId={projectId}
            electricalVariant={selectedVariant}
            electricalVariants={controller.variants}
            canMutate={canMutate}
            projectActiveJob={trackedJobs[0] ?? null}
            trackedJob={trackedJobs.find(
              (job) => job.electricalVariantId === selectedVariant.id,
            ) ?? null}
            completion={completionByVariant[selectedVariant.id] ?? null}
            registerJob={registerJob}
            onAssignmentsChanged={markAssignmentDataChanged}
            onAssignmentReadinessChange={handleAssignmentReadinessChange}
          />
        </div>
      )}
    </Space>
  );
}
