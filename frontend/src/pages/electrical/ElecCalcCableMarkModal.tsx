import type { ReactNode } from 'react';
import {
  Checkbox,
  Modal,
  Select,
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
import {
  objectDisplayName,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import type { ElectricalVariantTargetOption } from '@/pages/electrical/elecCalcVariantModel';

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
  markOptions: CableMarkSelectOption[];
  targetVariants: string[];
  targetVariantOptions: ElectricalVariantTargetOption[];
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
  const allTargetsAreSubmittable = targetVariants.length > 0 && targetVariants.every(
    (targetVariantId) =>
    targetVariantOptions.some((option) =>
      option.value === targetVariantId && !option.disabled),
  );
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
        disabled: !projectSelected || !object?.is_valid || !value || !allTargetsAreSubmittable,
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
              disabled={!projectSelected || pending || !commercialFeaturesAvailable}
              onChange={onCableTypeChange}
              options={cableTypeOptions}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
        )}
        {cableType && (
          projectSelected
            ? renderTypeControls(cableType)
            : (
              <fieldset disabled style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                {renderTypeControls(cableType)}
              </fieldset>
            )
        )}
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
          <Text id="electrical-cable-target-variants-label" type="secondary">
            Сохранить в ЭР
          </Text>
          <div
            role="group"
            aria-labelledby="electrical-cable-target-variants-label"
            aria-describedby="electrical-cable-target-variants-help"
          >
            <Checkbox.Group<string>
              options={targetVariantOptions}
              value={targetVariants}
              disabled={!projectSelected || pending}
              onChange={onTargetVariantsChange}
              style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}
            />
          </div>
        </div>
        <Text
          id="electrical-cable-target-variants-help"
          type="secondary"
          style={{ fontSize: 12 }}
        >
          «Авто» запустит автоподбор для выбранных ЭР. Выбор конкретной марки сохранит
          ручной подбор в отмеченных ЭР. Недоступные ЭР ещё не поддерживают перенос
          марки в текущем расчётном сервисе.
        </Text>
      </Space>
    </Modal>
  );
}
