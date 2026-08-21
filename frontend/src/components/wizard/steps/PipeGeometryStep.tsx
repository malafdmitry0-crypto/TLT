import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import HeatFormField from '../HeatFormField';

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
  /**
   * Пофилдовая выдача. Числовой блок макета чередует геометрию с температурами
   * (диаметр · Т окр · длина · требуемая T…), поэтому слоты широкой раскладки
   * забирают поля по одному. Условий видимости у этих двух полей нет — часть
   * задаёт только порядок, поведение не меняется.
   */
  part?: 'all' | 'diameter' | 'length';
}

export default function PipeGeometryStep({ fieldInputSettings, part = 'all' }: Props) {
  return (
    <>
      {(part === 'all' || part === 'diameter') && (
        <HeatFormField
          id="outer_diameter_mm"
          objectType="pipe"
          className="fit-label-form-item short-number-form-item outer-diameter-form-item helped-form-item"
          testId="outer-diameter-input"
          fieldInputSettings={fieldInputSettings}
        />
      )}

      {(part === 'all' || part === 'length') && (
        <HeatFormField
          id="pipe_length"
          objectType="pipe"
          className="fit-label-form-item long-number-form-item pipe-length-form-item helped-form-item"
          testId="pipe-length-input"
          fieldInputSettings={fieldInputSettings}
        />
      )}
    </>
  );
}
