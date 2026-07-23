import {
  Select,
  Segmented,
  Tag,
  Tooltip,
  Typography,
} from 'antd';

import type { SelectionPolicy } from '@/api/calculations';
import type { ElectricalCalculationCableSource } from '@/utils/electricalTableViewSettings';
import type { CatalogStatus } from '@/pages/electrical/elecCalcCableCatalogModel';
import { SHOW_COMMERCIAL_CABLE_BASE_UI } from '@/pages/electrical/elecCalcPageModel';
import { SELECTION_POLICY_OPTIONS } from '@/domain/electrical/elecCalcSelectionPolicyModel';

const { Text } = Typography;

type ElecCalcRecalculationSettingsProps = {
  commercialFeaturesAvailable: boolean;
  isEmployee: boolean;
  calculationCableSource: ElectricalCalculationCableSource;
  cableSourceOptions: Array<{ label: string; value: ElectricalCalculationCableSource }>;
  selectionPolicy: SelectionPolicy;
  commercialDataStatus: CatalogStatus;
  technicalDataStatus: CatalogStatus;
  onCalculationCableSourceChange: (value: ElectricalCalculationCableSource) => void;
  onSelectionPolicyChange: (value: SelectionPolicy) => void;
  showCommercialCableBaseUi?: boolean;
};

export default function ElecCalcRecalculationSettings({
  commercialFeaturesAvailable,
  isEmployee,
  calculationCableSource,
  cableSourceOptions,
  selectionPolicy,
  commercialDataStatus,
  technicalDataStatus,
  onCalculationCableSourceChange,
  onSelectionPolicyChange,
  showCommercialCableBaseUi = SHOW_COMMERCIAL_CABLE_BASE_UI,
}: ElecCalcRecalculationSettingsProps) {
  return (
    <div
      className="table-view-settings-panel electrical-recalculation-settings-panel"
      aria-label="Настройки пересчёта"
    >
      {commercialFeaturesAvailable && (
        <>
          <Tooltip title="Используется только при новом пересчёте или новом ручном выборе. Уже рассчитанные строки хранят снимок кабеля в проекте.">
            <Text className="table-view-settings-label">
              База для пересчёта:
            </Text>
          </Tooltip>
          <Segmented<ElectricalCalculationCableSource>
            aria-label="База для пересчёта"
            size="small"
            value={isEmployee ? calculationCableSource : 'builtin'}
            onChange={onCalculationCableSourceChange}
            options={cableSourceOptions}
          />
        </>
      )}
      {showCommercialCableBaseUi && (
        <>
          <Tag color={commercialDataStatus.color} style={{ marginInlineEnd: 0 }}>
            {commercialDataStatus.label}
          </Tag>
          <Text className="table-view-settings-label">
            Критерий:
          </Text>
          <Select<SelectionPolicy>
            aria-label="Критерий подбора кабеля"
            size="small"
            value={selectionPolicy}
            onChange={onSelectionPolicyChange}
            options={SELECTION_POLICY_OPTIONS}
            style={{ width: 128 }}
          />
        </>
      )}
      <Tag color={technicalDataStatus.color} style={{ marginInlineEnd: 0 }}>
        {technicalDataStatus.label}
      </Tag>
    </div>
  );
}
