import { Form } from 'antd';
import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import type { InsulationEntry } from '@/types/reference';
import {
  heatCalcCustomControlRequiredProps,
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import {
  buildInsulationReferenceOptions,
} from '@/utils/referenceOptions';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';
import ReferencePicker, { type ReferencePickerOption } from '../ReferencePicker';
import InsulationTemperatureRangeField from '../InsulationTemperatureRangeField';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType, mode?: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType, mode });
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  insulationMaterials?: InsulationEntry[];
  insulationMaterialOptions?: ReferencePickerOption[];
  insulationMaterialsError?: boolean;
  isInsulationMaterialsFetching?: boolean;
  onProgrammaticValuesChange?: (changedValues: Record<string, unknown>) => void;
}

export default function ThermalStep({
  objectType,
  fieldInputSettings,
  insulationMaterials,
  insulationMaterialOptions,
  insulationMaterialsError,
  isInsulationMaterialsFetching,
  onProgrammaticValuesChange,
}: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });
  const insulationMaterial = Form.useWatch('insulation_material', form);
  const shouldLoadInsulation = !insulationMaterials || !insulationMaterialOptions;
  const { data: queriedMaterials = [], isError, isFetching } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    enabled: shouldLoadInsulation,
    ...referenceQueryOptions,
  });
  const materials = insulationMaterials ?? queriedMaterials;
  const materialOptions = useMemo(
    () => [
      ...buildInsulationReferenceOptions(materials),
      { value: 'other', label: 'Другое' },
    ],
    [materials],
  );
  const effectiveMaterialOptions = insulationMaterialOptions ?? materialOptions;
  const effectiveInsulationMaterialsError = insulationMaterialsError ?? isError;
  const effectiveInsulationMaterialsFetching = isInsulationMaterialsFetching ?? isFetching;
  const selectedMaterial = materials.find((m) => m.material === insulationMaterial);

  return (
    <>
      <Form.Item
        className="fixed-select-form-item reduced-select-form-item layer-material-form-item first-layer-material-form-item helped-form-item"
        label={fieldLabel('insulation_material', objectType)}
        name="insulation_material"
        rules={heatCalcFormFieldRules(form, objectType, 'insulation_material')}
      >
        {withHelp(
          <ReferencePicker
            data-testid="insulation-material-select"
            options={effectiveMaterialOptions}
            placeholder="Выберите материал"
            modalTitle="Материал изоляции"
            searchPlaceholder="Поиск материала"
            loading={effectiveInsulationMaterialsFetching}
            notFoundContent={effectiveInsulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
            {...heatCalcCustomControlRequiredProps(form, objectType, 'insulation_material')}
          />,
          fieldHelp('insulation_material', objectType),
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item short-number-form-item helped-form-item"
        label={fieldLabel('insulation_thickness_mm', objectType)}
        name="insulation_thickness_mm"
        rules={heatCalcFormFieldRules(form, objectType, 'insulation_thickness_mm')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="insulation-thickness-input"
            {...numberInputProps('insulation_thickness_mm')}
                    unit="мм"
          />,
          fieldHelp('insulation_thickness_mm', objectType),
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item coefficient-form-item helped-form-item"
        label={fieldLabel('first_insulation_lambda', objectType)}
        name="first_insulation_lambda"
        preserve={false}
        rules={heatCalcFormFieldRules(form, objectType, 'first_insulation_lambda')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="first-insulation-lambda-input"
            {...numberInputProps('first_insulation_lambda')}
                    unit="Вт/мК"
          />,
          fieldHelp('first_insulation_lambda', objectType, insulationMaterial === 'other' ? 'manual' : 'reference'),
        )}
      </Form.Item>

      <InsulationTemperatureRangeField
        material={typeof insulationMaterial === 'string' ? insulationMaterial : undefined}
        selectedMaterial={selectedMaterial}
        minName="first_insulation_temperature_min"
        maxName="first_insulation_temperature_max"
        dataTestIdPrefix="first-insulation"
        objectType={objectType}
        labelFieldId="first_insulation_temperature_range"
        hint={fieldHelp('first_insulation_temperature_range', objectType)}
        required={heatCalcCustomControlRequiredProps(form, objectType, 'first_insulation_temperature_range').required}
        onRangeChange={onProgrammaticValuesChange}
      />
    </>
  );
}
