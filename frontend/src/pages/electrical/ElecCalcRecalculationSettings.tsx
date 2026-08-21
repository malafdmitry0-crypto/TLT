import {
  Segmented,
  Tooltip,
  Typography,
} from 'antd';

import type { SelectionPolicy } from '@/api/calculations';
import type { ElectricalCalculationCableSource } from '@/utils/electricalTableViewSettings';
import type { CatalogStatus } from '@/pages/electrical/elecCalcCableCatalogModel';
import { SHOW_COMMERCIAL_CABLE_BASE_UI } from '@/pages/electrical/elecCalcPageModel';
import { SELECTION_POLICY_OPTIONS } from '@/domain/electrical/elecCalcSelectionPolicyModel';
import { TltBadge, TltSelect } from '@/components/ui-kit';

const { Text } = Typography;

function antColorToTltTone(color: string | undefined): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (color) {
    case 'success':
    case 'green':
      return 'success';
    case 'error':
    case 'red':
    case 'volcano':
    case 'magenta':
      return 'danger';
    case 'warning':
    case 'gold':
    case 'orange':
      return 'warning';
    case 'default':
    case undefined:
      return 'neutral';
    default:
      return 'info';
  }
}

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
          <TltBadge tone={antColorToTltTone(commercialDataStatus.color)} className="electrical-inline-tag">
            {commercialDataStatus.label}
          </TltBadge>
          <Text className="table-view-settings-label">
            Критерий:
          </Text>
          <TltSelect
            aria-label="Критерий подбора кабеля"
            value={selectionPolicy}
            onChange={(value) => {
              if (value == null) return;
              onSelectionPolicyChange(String(value) as SelectionPolicy);
            }}
            options={SELECTION_POLICY_OPTIONS} className="tlt-field--w128"
          />
        </>
      )}
      <TltBadge tone={antColorToTltTone(technicalDataStatus.color)} className="electrical-inline-tag">
        {technicalDataStatus.label}
      </TltBadge>
    </div>
  );
}
