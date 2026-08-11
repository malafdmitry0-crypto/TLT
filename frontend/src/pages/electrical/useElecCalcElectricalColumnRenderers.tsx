import { useMemo } from 'react';
import { Space, Tooltip, Typography } from 'antd';

import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import { formatNumber } from '@/utils/formatters';
import {
  CABLE_TYPE_LABEL,
  OBJECT_TYPE_LABEL,
  objectDisplayName,
  cableSnapshotStatusTag,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import {
  calcLayoutValues,
  currentElectricalCalc,
  getCableMark,
  getThreadSource,
  selectionPolicyText,
  threadSourceTag,
  valueText,
} from '@/domain/electrical/elecCalcResultValueModel';
import { TltBadge, TltButton } from '@/components/ui-kit';
import {
  buildElecCalcRecalculationColumnRenderers,
  type ElecCalcRendererRecalculationValues,
} from '@/pages/electrical/elecCalcRecalculationColumnRenderers';
import {
  antColorToTltTone,
  buildElecCalcStatusColumnRenderers,
} from '@/pages/electrical/elecCalcStatusColumnRenderers';
import { buildElecCalcResultMetricColumnRenderers } from '@/pages/electrical/elecCalcResultMetricColumnRenderers';

const { Text } = Typography;

type UseElecCalcElectricalColumnRenderersOptions = {
  activeRowId: string | null;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalDisplayOffset: number;
  getCalculatedCableTypeForObject: (objectId: string) => CableTypeKey | null;
  isCableMarkPending: boolean;
  projectSelected: boolean;
  canMutate: boolean;
  recalc: ElecCalcRendererRecalculationValues;
  getObjectActionDisabledReason?: (obj: ProjectObject) => string | null;
  openCableMarkModal: (obj: ProjectObject) => void;
  openCableSizingModal: (obj: ProjectObject) => void;
};

export function useElecCalcElectricalColumnRenderers({
  activeRowId,
  calcByObjectId,
  electricalDisplayOffset,
  getCalculatedCableTypeForObject,
  isCableMarkPending,
  projectSelected,
  canMutate,
  recalc,
  getObjectActionDisabledReason = () => null,
  openCableMarkModal,
  openCableSizingModal,
}: UseElecCalcElectricalColumnRenderersOptions) {
  return useMemo<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>>(() => ({
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) =>
        electricalDisplayOffset + idx + 1,
    },
    object_name: {
      ellipsis: true,
      render: (_: unknown, obj) => (
        <Text className="electrical-cell-text">
          {objectDisplayName(obj)}
        </Text>
      ),
    },
    object_type: {
      render: (_: unknown, obj) => OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type,
    },
    ...buildElecCalcStatusColumnRenderers(calcByObjectId),
    cable_type: {
      render: (_: unknown, obj) => {
        const type = getCalculatedCableTypeForObject(obj.id);
        if (!type) {
          return <Text className="electrical-cell-text" type="secondary">—</Text>;
        }
        return (
          <Text className="electrical-cell-text">
            {CABLE_TYPE_LABEL[type] ?? valueText(type)}
          </Text>
        );
      },
    },
    cable_mark: {
      render: (_: unknown, obj) => {
        const calc = calcByObjectId[obj.id];
        const currentCalc = currentElectricalCalc(calc);
        const mark = getCableMark(currentCalc);
        const isActive = activeRowId === obj.id;
        const assignmentDisabledReason = getObjectActionDisabledReason(obj);

        if (!isActive) {
          return (
            <Space size={4} wrap={false}>
              <Text className="electrical-cell-text" type={mark ? undefined : 'secondary'}>
                {mark ?? '—'}
              </Text>
            </Space>
          );
        }

        return (
          <div className="electrical-cable-mark-cell">
            <span className="electrical-cable-mark-current">
              <Text
                className="electrical-cable-mark-text electrical-cell-text"
                title={mark ?? undefined}
                type={mark ? undefined : 'secondary'}
              >
                {mark ?? '—'}
              </Text>
            </span>
            <span className="electrical-cable-mark-actions">
              <Tooltip title={assignmentDisabledReason ?? undefined}>
                <span>
                  <TltButton
                    className="electrical-cable-mark-action"
                    size="compact"
                    disabled={
                      !canMutate
                      || !obj.is_valid
                      || !projectSelected
                      || assignmentDisabledReason != null
                    }
                    loading={isCableMarkPending}
                    onClick={() => openCableMarkModal(obj)}
                  >
                    Выбор
                  </TltButton>
                </span>
              </Tooltip>
              <Tooltip title={assignmentDisabledReason ?? undefined}>
                <span>
                  <TltButton
                    className="electrical-cable-mark-action"
                    size="compact"
                    disabled={
                      !obj.is_valid
                      || !projectSelected
                      || assignmentDisabledReason != null
                    }
                    onClick={() => openCableSizingModal(obj)}
                  >
                    Подбор
                  </TltButton>
                </span>
              </Tooltip>
            </span>
          </div>
        );
      },
    },
    cable_snapshot_status: {
      render: (_: unknown, obj) => {
        const meta = cableSnapshotStatusTag(currentElectricalCalc(calcByObjectId[obj.id]));
        if (!meta) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={meta.tooltip}>
            <TltBadge tone={antColorToTltTone(meta.color)} className="electrical-inline-tag">
              {meta.label}
            </TltBadge>
          </Tooltip>
        );
      },
    },
    selection_policy: {
      render: (_: unknown, obj) =>
        selectionPolicyText(currentElectricalCalc(calcByObjectId[obj.id])?.results?.selection_policy),
    },
    applied_selection_policy: {
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(calcByObjectId[obj.id]);
        const requested = calc?.results?.selection_policy;
        const applied = calc?.results?.applied_selection_policy;
        const label = selectionPolicyText(applied);
        const changed = typeof requested === 'string' && typeof applied === 'string' && requested !== applied;
        return changed ? <TltBadge tone="warning">{label}</TltBadge> : label;
      },
    },
    selection_reason: {
      render: (_: unknown, obj) => {
        const reason = currentElectricalCalc(calcByObjectId[obj.id])?.results?.selection_reason;
        return (
          <Tooltip title={valueText(reason)}>
            <span className="electrical-selection-reason-cell">
              {valueText(reason)}
            </span>
          </Tooltip>
        );
      },
    },
    winding_pitch_mm: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(calcByObjectId[obj.id]);
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc);
        return (
          <Text className="electrical-cell-text" type={mark ? undefined : 'secondary'}>
            {mark ? formatNumber(values.windingPitchMm, 0) : '—'}
          </Text>
        );
      },
    },
    number_of_threads: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(calcByObjectId[obj.id]);
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc);
        const sourceMeta = threadSourceTag(getThreadSource(calc));
        const sourceTag = sourceMeta ? (
          <Tooltip title={sourceMeta.tooltip}>
            <TltBadge
              color={sourceMeta.color}
              className="electrical-inline-tag--compact"
            >
              {sourceMeta.label}
            </TltBadge>
          </Tooltip>
        ) : null;

        return (
          <Space size={4} wrap={false}>
            <Text className="electrical-cell-text" type={mark ? undefined : 'secondary'}>
              {mark ? values.numberOfThreads : '—'}
            </Text>
            {mark ? sourceTag : null}
          </Space>
        );
      },
    },
    ...buildElecCalcRecalculationColumnRenderers(calcByObjectId, recalc),
    ...buildElecCalcResultMetricColumnRenderers(calcByObjectId),
  }), [
    activeRowId,
    calcByObjectId,
    canMutate,
    electricalDisplayOffset,
    getCalculatedCableTypeForObject,
    getObjectActionDisabledReason,
    isCableMarkPending,
    openCableMarkModal,
    openCableSizingModal,
    projectSelected,
    recalc,
  ]);
}
