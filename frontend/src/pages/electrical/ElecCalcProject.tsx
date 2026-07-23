import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Space } from 'antd';
import { useLocation } from 'react-router-dom';

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
  } = useElectricalBatchJobTracker();
  const registeredNavigationJobIdsRef = useRef(new Set<string>());
  const setLegacyVariant = useCalculationVariantStore((state) => state.setVariant);
  const clearLegacyVariant = useCalculationVariantStore((state) => state.clearVariant);
  const selectedVariant = controller.selectedVariant;
  const [assignmentDataEpoch, setAssignmentDataEpoch] = useState(0);
  const markAssignmentDataChanged = useCallback(() => {
    setAssignmentDataEpoch((current) => current + 1);
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

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <ElectricalVariantTabs controller={controller} canMutate={canMutate} />
      {selectedVariant?.legacy_variant_number == null && selectedVariant && (
        <div
          id={electricalVariantPanelId(selectedVariant.id)}
          role="tabpanel"
          aria-labelledby={electricalVariantTabId(selectedVariant.id)}
        >
          <Alert
            type="warning"
            showIcon
            message={`«${selectedVariant.name}»: расчётные действия временно недоступны`}
            description={(
              <span>
                Для этого ЭР ещё нет UUID-совместимого расчётного контура. Расчёт, кандидаты,
                спецификация и отчёт отключены; данные другого ЭР не подставляются.
              </span>
            )}
          />
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
            trackedJob={trackedJobs.find(
              (job) => job.electricalVariantId === selectedVariant.id,
            ) ?? null}
            completion={completionByVariant[selectedVariant.id] ?? null}
            registerJob={registerJob}
            onAssignmentsChanged={markAssignmentDataChanged}
          />
        </div>
      )}
    </Space>
  );
}

