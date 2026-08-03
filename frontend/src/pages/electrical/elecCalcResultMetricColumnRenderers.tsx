/**
 * Result / commercial metric column renderers (P-BAND-03).
 */
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import { STOCK_STATUS_LABEL } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import {
  cablePowerPerMeterValue,
  commercialNumber,
  commercialValue,
  currentElectricalCalc,
  compactProvenanceValue,
  engineeringResultNumber,
  installedPowerPerMeterValue,
  numberText,
  objectResultNumber,
  orderCableLengthValue,
  powerText,
  resultNumber,
} from '@/domain/electrical/elecCalcResultValueModel';

export function buildElecCalcResultMetricColumnRenderers(
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
): Partial<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>> {
  return {
    installed_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        engineeringResultNumber(
          currentElectricalCalc(calcByObjectId[obj.id]),
          'installed_cable_length',
        ),
    },
    order_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(orderCableLengthValue(currentElectricalCalc(calcByObjectId[obj.id])), 1),
    },
    required_installed_length_m: { align: 'right', render: (_: unknown, obj) => engineeringResultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'required_installed_length_m') },
    section_l_max_m: { align: 'right', render: (_: unknown, obj) => engineeringResultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'section_l_max_m') },
    section_l_tok_m: { align: 'right', render: (_: unknown, obj) => engineeringResultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'section_l_tok_m') },
    section_l_ogr_m: { align: 'right', render: (_: unknown, obj) => engineeringResultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'section_l_ogr_m') },
    section_l_excess_m: { align: 'right', render: (_: unknown, obj) => engineeringResultNumber(currentElectricalCalc(calcByObjectId[obj.id]), 'section_l_excess_m') },
    provenance: { ellipsis: true, render: (_: unknown, obj) => compactProvenanceValue(currentElectricalCalc(calcByObjectId[obj.id])) },
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
      render: (_: unknown, obj) => numberText(
        currentElectricalCalc(calcByObjectId[obj.id])?.results?.current,
        2,
      ),
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
    heat_loss_per_meter_base: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_meter_base', 2),
    },
    heat_loss_per_m2_bare_base: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_m2_bare_base', 2),
    },
    total_heat_loss_design: {
      align: 'right',
      render: (_: unknown, obj) => powerText(obj.results?.total_heat_loss_design),
    },
  };
}
