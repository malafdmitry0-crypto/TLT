import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import type { InsulationEntry } from '@/types/reference';
import { heatCalcCustomControlRequiredProps } from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import { getHeatCalcFieldDescription } from '@/domain/heatCalcFields';
import {
  buildInsulationReferenceOptions,
} from '@/utils/referenceOptions';
import { TltForm } from '@/components/ui-kit';
import HeatFormField from '../HeatFormField';
import InsulationConductivityField from '../InsulationConductivityField';
import ReferencePicker, { type ReferencePickerOption } from '../ReferencePicker';
import InsulationTemperatureRangeField from '../InsulationTemperatureRangeField';

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
  /**
   * When true (InsulationLayersTable), wrap each field in .insulation-layer-cell--*
   * so 5-col grid is structural and immune to legacy form-item grid-column rules.
   */
  tableCells?: boolean;
}

export default function ThermalStep({
  objectType,
  fieldInputSettings,
  insulationMaterials,
  insulationMaterialOptions,
  insulationMaterialsError,
  isInsulationMaterialsFetching,
  onProgrammaticValuesChange,
  tableCells = false,
}: Props) {
  const form = TltForm.useFormInstance();
  const insulationMaterial = TltForm.useWatch('insulation_material', form);
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

  const materialField = (
    <HeatFormField
      id="insulation_material"
      objectType={objectType}
      className="fixed-select-form-item reduced-select-form-item layer-material-form-item first-layer-material-form-item helped-form-item"
    >
      <ReferencePicker
        data-testid="insulation-material-select"
        options={effectiveMaterialOptions}
        placeholder="Выберите материал"
        modalTitle="Материал изоляции"
        searchPlaceholder="Поиск материала"
        loading={effectiveInsulationMaterialsFetching}
        notFoundContent={effectiveInsulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
        {...heatCalcCustomControlRequiredProps(form, objectType, 'insulation_material')}
      />
    </HeatFormField>
  );

  const thicknessField = (
    <HeatFormField
      id="insulation_thickness_mm"
      objectType={objectType}
      className="numeric-form-item short-number-form-item helped-form-item"
      testId="insulation-thickness-input"
      fieldInputSettings={fieldInputSettings}
    />
  );

  const lambdaField = (
    <InsulationConductivityField
      material={typeof insulationMaterial === 'string' ? insulationMaterial : undefined}
      selectedMaterial={selectedMaterial}
      name="first_insulation_lambda"
      dataTestIdPrefix="first-insulation"
      objectType={objectType}
      fieldInputSettings={fieldInputSettings}
      labelFieldId="first_insulation_lambda"
    />
  );

  const rangeField = (
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
  );

  if (!tableCells) {
    return (
      <>
        {materialField}
        {thicknessField}
        {lambdaField}
        {rangeField}
      </>
    );
  }

  return (
    <>
      <div className="insulation-layer-cell insulation-layer-cell--material">{materialField}</div>
      <div className="insulation-layer-cell insulation-layer-cell--thickness">{thicknessField}</div>
      <div className="insulation-layer-cell insulation-layer-cell--lambda">{lambdaField}</div>
      <div className="insulation-layer-cell insulation-layer-cell--range">{rangeField}</div>
    </>
  );
}
