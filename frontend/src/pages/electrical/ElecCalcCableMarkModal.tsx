import type { ReactNode } from 'react';
import {
  Checkbox,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd';

import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ProjectObject } from '@/types/project';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import {
  objectDisplayName,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';

const { Text } = Typography;

type CableTypeSelectOption = {
  label: ReactNode;
  value: CableTypeKey;
};

type CalculationVariantOption = {
  label: string;
  value: CalculationVariant;
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
  markOptions: CableMarkSelectOption[];
  targetVariants: CalculationVariant[];
  targetVariantOptions: CalculationVariantOption[];
  renderTypeControls: (cableType: CableTypeKey) => ReactNode;
  onCableTypeChange: (nextType: CableTypeKey) => void;
  onMarkChange: (nextValue: string) => void;
  onTargetVariantsChange: (values: readonly unknown[]) => void;
  onApply: () => void;
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
  markOptions,
  targetVariants,
  targetVariantOptions,
  renderTypeControls,
  onCableTypeChange,
  onMarkChange,
  onTargetVariantsChange,
  onApply,
  onCancel,
}: ElecCalcCableMarkModalProps) {
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
        disabled: !object?.is_valid || !value || targetVariants.length === 0,
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
            <Select<CableTypeKey>
              aria-label="Тип кабеля для выбора марки"
              size="small"
              value={cableType}
              disabled={pending || !commercialFeaturesAvailable}
              onChange={onCableTypeChange}
              options={cableTypeOptions}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
        )}
        {cableType && renderTypeControls(cableType)}
        <div>
          <Text type="secondary">Марка</Text>
          <Select
            autoFocus
            showSearch
            value={value ?? AUTO_CABLE_MARK_VALUE}
            options={markOptions}
            optionFilterProp="searchLabel"
            disabled={!object?.is_valid || !projectSelected}
            loading={pending}
            notFoundContent="Нет доступных марок"
            style={{ width: '100%', marginTop: 4 }}
            onChange={onMarkChange}
          />
        </div>
        <div>
          <Text type="secondary">Сохранить в СО</Text>
          <Checkbox.Group
            aria-label="СО для сохранения выбора марки"
            options={targetVariantOptions}
            value={targetVariants}
            disabled={pending}
            onChange={onTargetVariantsChange}
            style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          «Авто» запустит автоподбор для выбранных СО. Выбор конкретной марки сохранит ручной
          подбор в отмеченных СО.
        </Text>
      </Space>
    </Modal>
  );
}
