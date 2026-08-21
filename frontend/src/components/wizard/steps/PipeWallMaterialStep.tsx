import { TltForm } from '@/components/ui-kit';
import { heatCalcCustomControlRequiredProps } from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { ReferenceOption } from '@/utils/referenceOptions';
import HeatFormField from '../HeatFormField';
import ReferencePicker from '../ReferencePicker';

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
  pipeMaterialOptions: ReferenceOption[];
  part?: 'all' | 'material' | 'thickness' | 'lambda';
}

/** Теплопроводность вводится руками только для материала «Другое». */
export default function PipeWallMaterialStep({
  fieldInputSettings,
  pipeMaterialOptions,
  part = 'all',
}: Props) {
  const form = TltForm.useFormInstance();
  const pipeMaterial = TltForm.useWatch('pipe_material', form);

  return (
    <>
      {(part === 'all' || part === 'thickness') && (
        <HeatFormField
          id="wall_thickness_mm"
          objectType="pipe"
          className="fit-label-form-item short-number-form-item wall-thickness-form-item helped-form-item"
          testId="wall-thickness-input"
          fieldInputSettings={fieldInputSettings}
        />
      )}
      {(part === 'all' || part === 'material') && (
        <HeatFormField
          id="pipe_material"
          objectType="pipe"
          className="pipe-material-form-item reduced-select-form-item helped-form-item"
        >
          <ReferencePicker
            data-testid="pipe-material-select"
            options={pipeMaterialOptions}
            placeholder="Выберите материал"
            modalTitle="Материал трубы"
            searchPlaceholder="Поиск материала трубы"
            {...heatCalcCustomControlRequiredProps(form, 'pipe', 'pipe_material')}
          />
        </HeatFormField>
      )}
      {(part === 'all' || part === 'lambda') && pipeMaterial === 'other' ? (
        <HeatFormField
          id="pipe_lambda"
          objectType="pipe"
          className="fit-label-form-item pipe-lambda-manual-form-item helped-form-item"
          testId="pipe-lambda-input"
          fieldInputSettings={fieldInputSettings}
          preserve={false}
        />
      ) : null}
    </>
  );
}
