import { TltSelect } from '@/components/form-controls';
import { TltForm } from '@/components/ui-kit';
import {
  heatCalcCustomControlRequiredProps,
  heatCalcSelectInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { SoilReferenceOption } from '@/utils/referenceOptions';
import type { HeatCalcObjectType } from '@/types/project';
import HeatFormField from '../HeatFormField';
import ReferencePicker from '../ReferencePicker';

interface Props {
  objectType: HeatCalcObjectType;
  part?: 'all' | 'wide' | 'numeric';
  fieldInputSettings?: HeatCalcFieldInputSettings;
  isSoilFetching: boolean;
  onSoilPickerOpen?: () => void;
  soilOptions: SoilReferenceOption[];
}

/** Грунтовые поля появляются только под землёй и не переживают смену размещения. */
export default function PlacementGroundStep({
  objectType,
  part = 'all',
  fieldInputSettings,
  isSoilFetching,
  onSoilPickerOpen,
  soilOptions,
}: Props) {
  const form = TltForm.useFormInstance();
  const placement = TltForm.useWatch('placement', form);
  const isUnderground = placement === 'underground';
  // подпись и правила — от поля реестра, значение формы лежит под другим именем
  const depthFieldId = objectType === 'pipe' ? 'pipe_centerline_depth' : 'tank_buried_height';
  const depthFieldName = objectType === 'pipe' ? 'burial_depth' : 'tank_buried_height';

  const wide = part === 'all' || part === 'wide';
  const numeric = part === 'all' || part === 'numeric';

  return (
    <>
      {wide && (
        <HeatFormField
          id="placement"
          objectType={objectType}
          className="fixed-select-form-item reduced-select-form-item placement-form-item helped-form-item"
        >
          <TltSelect
            data-testid="placement-select"
            {...heatCalcSelectInputProps(objectType, 'placement', { form })}
            placeholder="Выберите размещение"
            options={heatCalcSelectOptions(objectType, 'placement')}
          />
        </HeatFormField>
      )}
      {isUnderground && (
        <>
          {numeric && (
            <HeatFormField
              id={depthFieldId}
              name={depthFieldName}
              objectType={objectType}
              className="fit-label-form-item burial-depth-form-item helped-form-item"
              testId="burial-depth-input"
              fieldInputSettings={fieldInputSettings}
              preserve={false}
            />
          )}
          {numeric && (
            <HeatFormField
              id="ground_temperature"
              objectType={objectType}
              className="numeric-form-item helped-form-item"
              testId="ground-temperature-input"
              fieldInputSettings={fieldInputSettings}
              preserve={false}
            />
          )}
          {wide && (
            <HeatFormField
              id="ground_type"
              objectType={objectType}
              className="fixed-select-form-item ground-type-form-item helped-form-item"
              preserve={false}
            >
              <ReferencePicker
                data-testid="ground-type-select"
                loading={isSoilFetching}
                onOpen={onSoilPickerOpen}
                placeholder="Выберите грунт"
                modalTitle="Грунт"
                searchPlaceholder="Поиск грунта"
                options={[...soilOptions, { value: 'custom', label: 'Другое' }]}
                {...heatCalcCustomControlRequiredProps(form, objectType, 'ground_type')}
              />
            </HeatFormField>
          )}
          {numeric && (
            <HeatFormField
              id="ground_conductivity"
              objectType={objectType}
              className="numeric-form-item coefficient-form-item ground-conductivity-form-item helped-form-item"
              testId="ground-conductivity-input"
              fieldInputSettings={fieldInputSettings}
              preserve={false}
            />
          )}
        </>
      )}
    </>
  );
}
