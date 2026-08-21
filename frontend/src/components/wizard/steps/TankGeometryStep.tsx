import { TltSelect } from '@/components/form-controls';
import { TltForm } from '@/components/ui-kit';
import {
  heatCalcSelectInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import HeatFormField from '../HeatFormField';

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
  /**
   * `size-a` / `size-b` / `size-rest` — порядок кадра: числовой блок чередует
   * размеры резервуара с температурами (размер · Т окр · размер · требуемая T ·
   * остальные размеры). Какие именно размеры видны, по-прежнему решает форма —
   * условия ниже не менялись.
   */
  part?: 'all' | 'wide' | 'numeric' | 'size-a' | 'size-b' | 'size-rest';
}

/** Размеры резервуара зависят от формы: у цилиндра нет длины, у куба — диаметра. */
export default function TankGeometryStep({ fieldInputSettings, part = 'all' }: Props) {
  const form = TltForm.useFormInstance();
  const shape = TltForm.useWatch('shape', form) as string | undefined;
  const needDiameter = shape === 'cylindrical';
  const needHeight = shape === 'cylindrical' || shape === 'rectangular';
  const needLength = shape === 'rectangular';
  const needWidth = shape === 'rectangular';

  const size = (id: string, cls: string, testId: string) => (
    <HeatFormField
      key={id}
      id={id}
      objectType="tank"
      className={`numeric-form-item tank-size-form-item ${cls} helped-form-item`}
      testId={testId}
      fieldInputSettings={fieldInputSettings}
    />
  );

  const diameter = size('diameter_mm', 'tank-diameter-form-item', 'tank-diameter-input');
  const height = size('height_mm', 'tank-height-form-item', 'tank-height-input');
  const length = size('length_mm', 'tank-length-form-item', 'tank-length-input');
  const width = size('width_mm', 'tank-width-form-item', 'tank-width-input');

  // первый и второй размеры — те, что в кадре стоят до и после «Температуры
  // окружающей среды»; остальные идут подряд после «Требуемой температуры»
  const sizeA = needDiameter ? [diameter] : needLength ? [length] : [];
  const sizeB = needDiameter && needHeight ? [height] : needWidth ? [width] : [];
  const sizeRest = [
    ...(needHeight && !needDiameter ? [height] : []),
    size('wall_thickness_mm', 'tank-wall-thickness-form-item', 'tank-wall-thickness-input'),
    size('wall_lambda', 'tank-wall-lambda-form-item', 'tank-wall-lambda-input'),
  ];

  const numeric = part === 'all' || part === 'numeric';

  return (
    <>
      {(part === 'all' || part === 'wide') && (
        <HeatFormField
          id="shape"
          objectType="tank"
          className="fixed-select-form-item tank-shape-form-item helped-form-item"
          dependencies={['placement']}
        >
          <TltSelect
            data-testid="tank-shape-select"
            {...heatCalcSelectInputProps('tank', 'shape', { form })}
            options={heatCalcSelectOptions('tank', 'shape')}
            placeholder="Выберите форму"
          />
        </HeatFormField>
      )}

      {(numeric || part === 'size-a') && sizeA}
      {(numeric || part === 'size-b') && sizeB}
      {(numeric || part === 'size-rest') && sizeRest}
    </>
  );
}
