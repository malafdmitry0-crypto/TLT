import { TltForm } from '@/components/ui-kit';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import HeatFormField from '../HeatFormField';

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  /** Пофилдовая выдача для числового блока широкой раскладки (порядок кадра). */
  part?: 'all' | 'count' | 'equiv' | 'q';
}

/**
 * Локальные элементы трубы + q_доп резервуара.
 * Электропараметры алгоритма выбора кабеля вынесены в CableAlgorithmPanel
 * (правая форма HeatCalc). Hidden round-trip больше не нужен — те же Form.Item
 * живут в CableAlgorithmPanel внутри того же Form.
 */
export default function ElectricalAndFittingsStep({
  objectType,
  fieldInputSettings,
  part = 'all',
}: Props) {
  const form = TltForm.useFormInstance();
  const localElementCount = Number(
    TltForm.useWatch('num_local_elements', form)
      ?? form.getFieldValue('num_local_elements')
      ?? 0,
  );

  return (
    <>
      {objectType === 'tank' && (part === 'all' || part === 'q') && (
        <HeatFormField
          id="q_additional"
          objectType={objectType}
          className="numeric-form-item coefficient-form-item tank-additional-heat-loss-form-item helped-form-item"
          testId="q-additional-input"
          fieldInputSettings={fieldInputSettings}
          preserve={false}
        />
      )}
      {objectType === 'pipe' && (
        <>
          {(part === 'all' || part === 'count') && <HeatFormField
            id="num_local_elements"
            objectType={objectType}
            className="numeric-form-item fitting-count-form-item local-elements-count-form-item helped-form-item"
            testId="local-elements-count-input"
            fieldInputSettings={fieldInputSettings}
          />}
          {(part === 'all' || part === 'equiv') && Number.isFinite(localElementCount) && localElementCount > 0 && (
            <HeatFormField
              id="local_element_equiv_length"
              objectType={objectType}
              className="numeric-form-item fitting-count-form-item local-element-equiv-length-form-item helped-form-item"
              testId="local-element-equiv-length-input"
              fieldInputSettings={fieldInputSettings}
              preserve={false}
            />
          )}
        </>
      )}
    </>
  );
}
