import { Typography } from 'antd';
import { TltBadge } from '@/components/ui-kit';

import type { ElectricalCalcSummary, ElectricalCandidate } from '@/types/calculation';
import { candidateOrderCableLengthValue } from '@/domain/electrical/elecCalcCandidateCompareModel';
import {
  CABLE_TYPE_LABEL,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import {
  getCableMark,
  numberText,
  orderCableLengthValue,
  powerText,
  valueText,
} from '@/domain/electrical/elecCalcResultValueModel';

const { Text } = Typography;

type ElecCalcSelectedCableSummaryProps = {
  appliedCandidate: ElectricalCandidate | null;
  calc: ElectricalCalcSummary | null | undefined;
  fallbackCableType: CableTypeKey;
};

export default function ElecCalcSelectedCableSummary({
  appliedCandidate,
  calc,
  fallbackCableType,
}: ElecCalcSelectedCableSummaryProps) {
  const currentCalc = calc ?? undefined;
  const mark = appliedCandidate?.cable_mark ?? getCableMark(currentCalc);
  const cableType = (appliedCandidate?.cable_type ?? currentCalc?.cable_type ?? fallbackCableType) as CableTypeKey;
  const results = appliedCandidate?.results ?? currentCalc?.results;
  const orderLength = appliedCandidate
    ? candidateOrderCableLengthValue(appliedCandidate)
    : orderCableLengthValue(currentCalc);

  if (!mark) {
    return (
      <div className="electrical-selected-cable-summary">
        <Text strong>Выбранный кабель:</Text>
        <Text type="secondary">Кабель не выбран</Text>
      </div>
    );
  }

  return (
    <div className="electrical-selected-cable-summary">
      <Text strong>Выбранный кабель:</Text>
      <TltBadge tone="info" className="electrical-selected-cable-summary__mark">
        {mark}
      </TltBadge>
      <Text type="secondary">{CABLE_TYPE_LABEL[cableType] ?? valueText(cableType)}</Text>
      <Text type="secondary">
        P: <strong>{powerText(results?.total_power)}</strong>
      </Text>
      <Text type="secondary">
        Заказ: <strong>{numberText(orderLength, 1)} м</strong>
      </Text>
      <Text type="secondary">
        I: <strong>{numberText(results?.current, 2)} А</strong>
      </Text>
    </div>
  );
}
