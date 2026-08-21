/**
 * @module electrical/manual-overwrite-control
 * @owner electrical
 * @depends antd only
 * @does-not heat
 */
import type { ReactNode } from 'react';
import { Checkbox, Typography } from 'antd';

const { Text } = Typography;

export type ElecCalcManualOverwriteControlProps = {
  manualCount: number;
  canMutate: boolean;
  overwriteManualChoices: boolean;
  onOverwriteChange: (checked: boolean) => void;
};

export function ElecCalcManualOverwriteControl({
  manualCount,
  canMutate,
  overwriteManualChoices,
  onOverwriteChange,
}: ElecCalcManualOverwriteControlProps): ReactNode {
  if (manualCount <= 0) return null;
  return (
    <>
      <Text type="secondary">
        Найдено ручных выборов: {manualCount}. По умолчанию они будут сохранены и пропущены.
      </Text>
      <Checkbox
        disabled={!canMutate}
        checked={overwriteManualChoices}
        onChange={(event) => {
          if (canMutate) onOverwriteChange(event.target.checked);
        }}
      >
        Перезаписать ручные выборы ({manualCount})
      </Checkbox>
    </>
  );
}
