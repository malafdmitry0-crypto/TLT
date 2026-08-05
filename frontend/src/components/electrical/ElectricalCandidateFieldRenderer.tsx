import { Space, Tooltip, Typography } from 'antd';
import { TltBadge } from '@/components/ui-kit';

import {
  candidateCommercialValue,
  candidateInstalledPowerPerMeterValue,
  candidateOrderCableLengthValue,
  candidatePowerPerMeterValue,
  candidateThreadSource,
} from '@/domain/electrical/elecCalcCandidateCompareModel';
import {
  CABLE_TYPE_LABEL,
  CONNECTION_TYPE_LABEL,
  STOCK_STATUS_LABEL,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import {
  compactProvenanceFromResults,
  engineeringResultValueFromResults,
  numberText,
  powerText,
  selectionPolicyText,
  threadSourceTag,
  valueText,
} from '@/domain/electrical/elecCalcResultValueModel';
import type { ElectricalCandidate } from '@/types/calculation';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import './electrical-candidate-field.css';

const { Text } = Typography;

export function renderCandidateElectricalField(
  key: ElectricalColumnKey,
  candidate: ElectricalCandidate,
) {
  switch (key) {
    case 'cable_type':
      return CABLE_TYPE_LABEL[candidate.cable_type as CableTypeKey] ?? candidate.cable_type;
    case 'cable_mark':
      return (
        <Space size={4} wrap={false}>
          <Text strong={candidate.is_recommended} ellipsis className="electrical-candidate-mark">
            {candidate.cable_mark ?? '—'}
          </Text>
          {candidate.is_recommended && <TltBadge className="electrical-candidate-badge" tone="info">приор.</TltBadge>}
          {candidate.is_pinned && <TltBadge className="electrical-candidate-badge" tone="neutral">избр.</TltBadge>}
        </Space>
      );
    case 'cable_snapshot_status':
      return candidate.cable_snapshot ? (
        <TltBadge className="electrical-candidate-badge" tone="success">снимок</TltBadge>
      ) : '—';
    case 'selection_policy':
      return selectionPolicyText(candidate.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(candidate.results?.applied_selection_policy);
    case 'selection_reason': {
      const reason = candidate.reason_message ?? candidate.results?.selection_reason;
      return (
        <Tooltip title={valueText(reason)}>
          <Text
            className="electrical-selection-reason-cell"
            type={candidate.reason_message ? 'danger' : 'secondary'}
          >
            {valueText(reason)}
          </Text>
        </Tooltip>
      );
    }
    case 'winding_pitch_mm':
      return numberText(candidate.results?.winding_pitch, 0);
    case 'number_of_threads': {
      const sourceMeta = threadSourceTag(candidateThreadSource(candidate));
      return (
        <Space size={4} wrap={false}>
          <Text>{numberText(candidate.results?.num_circuits, 0)}</Text>
          {sourceMeta && (
            <Tooltip title={sourceMeta.tooltip}>
              <TltBadge
                className="electrical-candidate-badge--compact"
                tone={
                  sourceMeta.color === 'blue'
                    ? 'info'
                    : sourceMeta.color === 'gold'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {sourceMeta.label}
              </TltBadge>
            </Tooltip>
          )}
        </Space>
      );
    }
    case 'laying_step':
      return numberText(candidate.params?.laying_step, 2);
    case 'heating_height':
      return numberText(candidate.params?.heating_height, 1);
    case 'connection_type': {
      const value = candidate.params?.connection_type;
      return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
    }
    case 'supply_voltage':
      return numberText(candidate.params?.supply_voltage, 0);
    case 'winding_coefficient':
      return numberText(candidate.params?.winding_coefficient, 2);
    case 'installed_cable_length':
      return numberText(
        engineeringResultValueFromResults(candidate.results, 'installed_cable_length'),
        1,
      );
    case 'order_cable_length':
      return numberText(candidateOrderCableLengthValue(candidate), 1);
    case 'required_installed_length_m':
    case 'section_l_max_m':
    case 'section_l_tok_m':
    case 'section_l_ogr_m':
    case 'section_l_excess_m': {
      return numberText(
        engineeringResultValueFromResults(candidate.results, key),
        1,
      );
    }
    case 'provenance':
      return compactProvenanceFromResults(candidate.results);
    case 'total_power':
      return powerText(candidate.results?.total_power);
    case 'power_per_meter':
      return numberText(candidatePowerPerMeterValue(candidate), 2);
    case 'installed_power_per_meter':
      return numberText(candidateInstalledPowerPerMeterValue(candidate), 2);
    case 'current':
      return numberText(candidate.results?.current, 2);
    case 'voltage':
      return numberText(candidate.results?.voltage, 0);
    case 'price_per_meter':
      return numberText(candidateCommercialValue(candidate, 'price_per_meter'), 2);
    case 'required_order_length':
      return numberText(candidateCommercialValue(candidate, 'required_order_length'), 1);
    case 'total_cost':
      return numberText(candidateCommercialValue(candidate, 'total_cost'), 2);
    case 'stock_status': {
      const value = candidateCommercialValue(candidate, 'stock_status');
      return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
    }
    case 'lead_time_days':
      return numberText(candidateCommercialValue(candidate, 'lead_time_days'), 0);
    default:
      return valueText(candidate.results?.[key] ?? candidate.params?.[key]);
  }
}
