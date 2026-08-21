/**
 * Recalculation-parameter column renderers for electrical main table.
 * Independent of cable-mark/action presentation families.
 */
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import { CONNECTION_TYPE_LABEL } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import {
  numberText,
  valueText,
} from '@/domain/electrical/elecCalcResultValueModel';

export type ElecCalcRendererRecalculationValues = {
  connectionType: string;
  heatingHeight: number | null;
  layingStep: number | null | undefined;
  supplyVoltage: number | null;
  windingCoefficient: number | null;
};

export function buildElecCalcRecalculationColumnRenderers(
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
  recalc: ElecCalcRendererRecalculationValues,
): Partial<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>> {
  return {
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
  };
}
