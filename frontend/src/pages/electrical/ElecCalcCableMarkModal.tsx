import type { ReactNode } from 'react';
import {
  Checkbox,
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
import {
  objectDisplayName,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalVariantTargetOption } from '@/pages/electrical/elecCalcVariantModel';
import { TltSelect } from '@/components/ui-kit';

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
              className="electrical-radio-row"
            />
          </div>
        </div>
        <Text
          id="electrical-cable-target-variants-help"
          type="secondary"
          className="electrical-radio-hint"
        >
          «Авто» запустит автоподбор для выбранных ЭР. Выбор конкретной марки сохранит
          ручной подбор в отмеченных ЭР. Недоступные ЭР ещё не поддерживают перенос
          марки в текущем расчётном сервисе.
        </Text>
      </Space>
    </Modal>
  );
}
