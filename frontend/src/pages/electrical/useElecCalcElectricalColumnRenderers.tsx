import { useMemo } from 'react';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';

import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import {
  electricalCalcError,
  electricalCalcHint,
  isElectricalCalcStale,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import { formatNumber } from '@/utils/formatters';
import {
  CABLE_TYPE_LABEL,
  CONNECTION_TYPE_LABEL,
  OBJECT_TYPE_LABEL,
  objectDisplayName,
  STOCK_STATUS_LABEL,
  cableSnapshotStatusTag,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import {
  calcLayoutValues,
  cablePowerPerMeterValue,
  commercialNumber,
  commercialValue,
  currentElectricalCalc,
  getCableMark,
  getThreadSource,
  installedPowerPerMeterValue,
  numberText,
  objectResultNumber,
  orderCableLengthValue,
  powerText,
  resultNumber,
  selectionPolicyText,
  threadSourceTag,
  valueText,
} from '@/pages/electrical/elecCalcResultValueModel';

const { Text } = Typography;

type ElecCalcRendererRecalculationValues = {
  aggressiveProduct: boolean;
  connectionType: string;
  heatingHeight: number | null;
  layingStep: number | null;
  maintainTemperature: number | null;
  supplyVoltage: number | null;
  vaporTemperature: number | null;
  windingCoefficient: number | null;
};

type UseElecCalcElectricalColumnRenderersOptions = {
  activeRowId: string | null;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalDisplayOffset: number;
  getCalculatedCableTypeForObject: (objectId: string) => CableTypeKey | null;
  isCableMarkPending: boolean;
  projectSelected: boolean;
  canMutate: boolean;
  recalc: ElecCalcRendererRecalculationValues;
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
        <Text style={{ fontSize: 12 }}>
          {objectDisplayName(obj)}
        </Text>
      ),
    },
    object_type: {
      render: (_: unknown, obj) => OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type,
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        if (obj.is_valid) {
          return (
            <Tooltip title="Рассчитан">
              <Tag className="heatloss-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        }
        if (obj.validation_errors?.category === 'unsupported') {
          return (
            <Tooltip title={valueText(obj.validation_errors?.message ?? obj.validation_errors)}>
              <Tag color="default">Не применимо</Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip
            title={valueText(
              obj.validation_errors?.message ??
              obj.validation_errors,
            )}
          >
            <Tag className="heatloss-status-icon-tag" color="error" aria-label="Ошибка">
              <CloseCircleFilled />
            </Tag>
          </Tooltip>
        );
      },
    },
    electrical_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        const calc = calcByObjectId[obj.id];
        const err = electricalCalcError(calc);
        const unsupported = isElectricalCalcUnsupported(calc);
        const stale = isElectricalCalcStale(calc);
        if (isElectricalCalcSuccess(calc))
          return (
            <Tooltip title="Рассчитан">
              <Tag className="electrical-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (unsupported)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? err ?? 'Не применимо'}>
              <Tag
                className="electrical-status-icon-tag"
                color="default"
                aria-label="Не применимо"
              >
                <MinusCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (stale)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? 'Требуется пересчёт'}>
              <Tag className="electrical-status-icon-tag" color="warning" aria-label="Требуется пересчёт">
                ↻
              </Tag>
            </Tooltip>
          );
        if (err)
          return (
            <Tooltip title={err}>
              <Tag className="electrical-status-icon-tag" color="error" aria-label="Ошибка">
                <CloseCircleFilled />
              </Tag>
            </Tooltip>
          );
        return (
          <Tooltip title="Не рассчитан">
            <Tag className="electrical-status-icon-tag" aria-label="Не рассчитан">—</Tag>
          </Tooltip>
        );
      },
    },
    cable_type: {
      render: (_: unknown, obj) => {
        const type = getCalculatedCableTypeForObject(obj.id);
        if (!type) {
          return <Text style={{ fontSize: 12 }} type="secondary">—</Text>;
        }
        return (
          <Text style={{ fontSize: 12 }}>
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

        if (!isActive) {
          return (
            <Space size={4} wrap={false}>
              <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
                {mark ?? '—'}
              </Text>
            </Space>
          );
        }

        return (
          <div className="electrical-cable-mark-cell">
            <span className="electrical-cable-mark-current">
              <Text
                className="electrical-cable-mark-text"
                style={{ fontSize: 12 }}
                title={mark ?? undefined}
                type={mark ? undefined : 'secondary'}
              >
                {mark ?? '—'}
              </Text>
            </span>
            <span className="electrical-cable-mark-actions">
              <Button
                className="electrical-cable-mark-action"
                size="small"
                disabled={!canMutate || !obj.is_valid || !projectSelected}
                loading={isCableMarkPending}
                onClick={() => openCableMarkModal(obj)}
              >
                Выбор
              </Button>
              <Button
                className="electrical-cable-mark-action"
                size="small"
                disabled={!projectSelected}
                onClick={() => openCableSizingModal(obj)}
              >
                Подбор
              </Button>
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
            <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
              {meta.label}
            </Tag>
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
        return changed ? <Tag color="warning">{label}</Tag> : label;
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
          <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
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
            <Tag
              color={sourceMeta.color}
              style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}
            >
              {sourceMeta.label}
            </Tag>
          </Tooltip>
        ) : null;

        return (
          <Space size={4} wrap={false}>
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? values.numberOfThreads : '—'}
            </Text>
            {mark ? sourceTag : null}
          </Space>
        );
      },
    },
    laying_step: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(calcByObjectId[obj.id]?.params?.laying_step ?? recalc.layingStep, 2),
    },
    heating_height: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(calcByObjectId[obj.id]?.params?.heating_height ?? recalc.heatingHeight, 1),
    },
    connection_type: {
      render: (_: unknown, obj) => {
        const value = calcByObjectId[obj.id]?.params?.connection_type ?? recalc.connectionType;
        return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
      },
    },
    supply_voltage: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(calcByObjectId[obj.id]?.params?.supply_voltage ?? recalc.supplyVoltage, 0),
    },
    winding_coefficient: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          calcByObjectId[obj.id]?.params?.winding_coefficient ?? recalc.windingCoefficient,
          2,
        ),
    },
    vapor_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(calcByObjectId[obj.id]?.params?.vapor_temperature ?? recalc.vaporTemperature, 1),
    },
    maintain_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          calcByObjectId[obj.id]?.params?.maintain_temperature ?? recalc.maintainTemperature,
          1,
        ),
    },
    aggressive_product: {
      align: 'center',
      render: (_: unknown, obj) =>
        valueText(calcByObjectId[obj.id]?.params?.aggressive_product ?? recalc.aggressiveProduct),
    },
    installed_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        resultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'installed_cable_length', 1),
    },
    order_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(orderCableLengthValue(currentElectricalCalc(calcByObjectId[obj.id])), 1),
    },
    total_power: {
      align: 'right',
      render: (_: unknown, obj) =>
        powerText(currentElectricalCalc(calcByObjectId[obj.id])?.results?.total_power),
    },
    power_per_meter: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(cablePowerPerMeterValue(currentElectricalCalc(calcByObjectId[obj.id])), 2),
    },
    installed_power_per_meter: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(installedPowerPerMeterValue(currentElectricalCalc(calcByObjectId[obj.id])), 2),
    },
    current: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'current', 2),
    },
    voltage: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'voltage', 0),
    },
    price_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'price_per_meter', 2),
    },
    required_order_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        commercialNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'required_order_length', 1),
    },
    total_cost: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'total_cost', 2),
    },
    stock_status: {
      render: (_: unknown, obj) => {
        const value = commercialValue(currentElectricalCalc(calcByObjectId[obj.id]), 'stock_status');
        return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
      },
    },
    lead_time_days: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'lead_time_days', 0),
    },
    heat_loss_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_meter', 2),
    },
    heat_loss_per_m2: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_m2', 2),
    },
    total_heat_loss: {
      align: 'right',
      render: (_: unknown, obj) => powerText(obj.results?.total_heat_loss),
    },
  }), [
    activeRowId,
    calcByObjectId,
    canMutate,
    electricalDisplayOffset,
    getCalculatedCableTypeForObject,
    isCableMarkPending,
    openCableMarkModal,
    openCableSizingModal,
    projectSelected,
    recalc,
  ]);
}
