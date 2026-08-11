import type { ReactNode } from 'react';
import {
  Modal,
  Space,
  Typography,
} from 'antd';

import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import type { ProjectObject } from '@/types/project';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { ElecCalcAutoAvailability } from '@/pages/electrical/elecCalcAutoAvailabilityModel';
import {
  objectDisplayName,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import { TltAlert, TltButton, TltSelect } from '@/components/ui-kit';

const { Text } = Typography;

type CableTypeSelectOption = {
  label: ReactNode;
  value: CableTypeKey;
};

type ElecCalcCableMarkModalProps = {
  object: ProjectObject | null;
  selectedCable: CableStatusRow | null;
  cableType: CableTypeKey | null;
  cableTypeOptions: CableTypeSelectOption[];
  commercialFeaturesAvailable: boolean;
  projectSelected: boolean;
  pending: boolean;
  value: string | null;
  threadCountValue: 'auto' | '1' | '2' | '3';
  markOptions: CableMarkSelectOption[];
  electricalVariantName: string;
  autoAvailability: ElecCalcAutoAvailability;
  renderTypeControls: (cableType: CableTypeKey) => ReactNode;
  onCableTypeChange: (nextType: CableTypeKey) => void;
  onMarkChange: (nextValue: string) => void;
  onThreadCountChange: (nextValue: 'auto' | '1' | '2' | '3') => void;
  onApply: () => void;
  onRetryAutoAvailability: () => void;
  onCancel: () => void;
};

export default function ElecCalcCableMarkModal({
  object,
  selectedCable,
  cableType,
  cableTypeOptions,
  commercialFeaturesAvailable,
  projectSelected,
  pending,
  value,
  threadCountValue,
  markOptions,
  electricalVariantName,
  autoAvailability,
  renderTypeControls,
  onCableTypeChange,
  onMarkChange,
  onThreadCountChange,
  onApply,
  onRetryAutoAvailability,
  onCancel,
}: ElecCalcCableMarkModalProps) {
  const selectedValue = value ?? AUTO_CABLE_MARK_VALUE;
  const autoBlocked = selectedValue === AUTO_CABLE_MARK_VALUE && autoAvailability.blocked;
  const title = (
    <div className="electrical-cable-picker-title">
      <span className="electrical-cable-picker-title-text">Выбор марки кабеля</span>
      {object && (
        <>
          <span className="electrical-cable-picker-title-for">для</span>
          <span className="electrical-cable-picker-title-object">
            {objectDisplayName(object)}
          </span>
        </>
      )}
    </div>
  );

  return (
    <Modal
      open={!!object}
      width="min(92vw, 1056px)"
      className="electrical-cable-picker-dialog"
      style={{ top: 28 }}
      title={title}
      okText="Применить"
      cancelText="Отмена"
      confirmLoading={pending}
      okButtonProps={{
        disabled: !projectSelected || !object?.is_valid || !value || autoBlocked,
      }}
      onOk={onApply}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {object && (
          <CablePickerCharacteristics
            object={object}
            cable={selectedCable}
            cableType={cableType}
          />
        )}
        {cableType && (
          <div>
            <Text type="secondary">Тип кабеля</Text>
            <TltSelect
              aria-label="Тип кабеля для выбора марки"
              value={cableType}
              disabled={!projectSelected || pending || !commercialFeaturesAvailable}
              onChange={(value) => {
                if (value == null) return;
                onCableTypeChange(String(value) as CableTypeKey);
              }}
              options={cableTypeOptions} className="tlt-field--fill-mt"
            />
          </div>
        )}
        {cableType && (
          projectSelected
            ? renderTypeControls(cableType)
            : (
              <fieldset disabled className="electrical-fieldset-reset">
                {renderTypeControls(cableType)}
              </fieldset>
            )
        )}
        <div>
          <Text type="secondary">Марка</Text>
          <TltSelect
            value={value ?? AUTO_CABLE_MARK_VALUE}
            options={markOptions}
            disabled={!object?.is_valid || !projectSelected} className="tlt-field--fill-mt"
            onChange={(value) => { if (value != null) onMarkChange(String(value)); }}
          />
        </div>
        <div>
          <Text type="secondary">Количество ниток</Text>
          <TltSelect
            aria-label="Количество ниток"
            value={threadCountValue}
            options={selectedValue === AUTO_CABLE_MARK_VALUE
              ? [{ value: 'auto', label: 'Авто' }]
              : [1, 2, 3].map((count) => ({ value: String(count), label: String(count) }))}
            disabled={!object?.is_valid || !projectSelected || pending}
            className="tlt-field--fill-mt"
            onChange={(nextValue) => {
              if (nextValue === 'auto' || nextValue === '1' || nextValue === '2' || nextValue === '3') {
                onThreadCountChange(nextValue);
              }
            }}
          />
        </div>
        <Text
          type="secondary"
          className="electrical-radio-hint"
        >
          Изменения будут применены только к текущему ЭР: {electricalVariantName}.
        </Text>
        {autoBlocked && (
          <TltAlert
            tone={autoAvailability.tone}
            action={autoAvailability.canRetry ? (
              <TltButton size="compact" onClick={onRetryAutoAvailability}>
                Повторить проверку
              </TltButton>
            ) : undefined}
          >
            {autoAvailability.message}
          </TltAlert>
        )}
      </Space>
    </Modal>
  );
}
