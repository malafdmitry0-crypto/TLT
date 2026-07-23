import { Typography } from 'antd';

import { TltButton } from '@/components/ui-kit';

const { Text } = Typography;

type ElecCalcCandidateCompareBarProps = {
  active: boolean;
  markedCount: number;
  diffCount: number;
  onReset: () => void;
};

export default function ElecCalcCandidateCompareBar({
  active,
  markedCount,
  diffCount,
  onReset,
}: ElecCalcCandidateCompareBarProps) {
  if (!active) return null;

  return (
    <div
      className="electrical-candidate-compare-bar"
      data-testid="candidate-compare-bar"
      role="status"
      aria-live="polite"
    >
      <Text strong>Сравнение: {markedCount} вариантов</Text>
      <Text type="secondary">
        {diffCount > 0
          ? `Отличий в видимых колонках: ${diffCount}`
          : 'В видимых колонках отличий нет'}
      </Text>
      <TltButton
        size="compact"
        variant="secondary"
        onClick={onReset}
      >
        Сбросить сравнение
      </TltButton>
    </div>
  );
}
