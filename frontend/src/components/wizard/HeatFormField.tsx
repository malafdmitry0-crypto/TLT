/**
 * Одно поле формы теплопотерь.
 *
 * До него каждый шаг собирал поле руками: `Form.Item` + подпись через
 * `getHeatCalcFieldLabel` + `withHelp` + правила + единица строковым литералом.
 * Единица при этом уже лежит в реестре (`input.unit`) и просто не читалась —
 * литералы разъезжались с конфигом молча.
 *
 * Компонент берёт из `domain/heatCalcFields` подпись, подсказку и единицу, а
 * правила и числовые пропсы — из `utils/heatCalcWizardFieldRules`. Разметка
 * остаётся прежней: тот же `Form.Item` с теми же классами и тот же
 * `HelpedControl`, поэтому DOM-контракт и поведение не меняются.
 *
 * Контрол выбирается так: числовое поле собирается само, всё остальное
 * (справочник, селект) приходит через `children` — им нужны данные времени
 * выполнения, которых в реестре нет.
 *
 * См. docs/tnp/cases/heat-frontend-restyle-prompt.md §4.
 */
import type { ReactElement, ReactNode } from 'react';
import { TltForm } from '@/components/ui-kit';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  heatCalcFieldRequired,
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import { isHeatCalcFieldRequired } from '@/domain/heatCalcFieldRules';
import type { HeatCalcObjectType } from '@/types/project';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import { FieldSourceExtra } from './FieldSourceTag';
import { resolveFieldSource } from './fieldSourceModel';

interface Props {
  /** Идентификатор поля в реестре: по нему берутся подпись, подсказка, правила. */
  id: string;
  /**
   * Имя в форме, если оно не совпадает с идентификатором реестра. Так живёт
   * глубина заложения: подпись и правила от `pipe_centerline_depth`, а значение
   * формы лежит в `burial_depth`.
   */
  name?: string;
  objectType: HeatCalcObjectType;
  /** Классы `Form.Item` — пофилдовые, в реестре их нет. */
  className: string;
  /** Попадает на числовой контрол; для `children` testid ставит вызывающий. */
  testId?: string;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  preserve?: boolean;
  /** Пересчитать валидацию при смене соседних полей (antd `dependencies`). */
  dependencies?: string[];
  /**
   * Явные правила вместо выведенных из реестра. Нужно там, где поле сейчас
   * живёт вовсе без валидации: `heatCalcFormFieldRules` всегда возвращает
   * валидатор, поэтому «просто мигрировать» такое поле — значит добавить ему
   * проверку, которой не было. Такие поля передают `rules={[]}`.
   */
  rules?: ReturnType<typeof heatCalcFormFieldRules>;
  /**
   * Видимая подсказка под контролом — слот antd `extra`. Живёт там же, где
   * сообщения валидации (`compact-fields.css`: `.ant-form-item-extra`), поэтому
   * новых стилей не требует. Для состояний «поле пустое не по ошибке
   * пользователя, а потому что системе не хватает соседнего значения».
   */
  extra?: ReactNode;
  /** Явный источник значения; без него required direct-entry считается ручным. */
  source?: unknown;
  /** Нестандартный контрол: справочник, селект, что угодно со своими данными. */
  children?: ReactElement;
}

export default function HeatFormField({
  id,
  name,
  objectType,
  className,
  testId,
  fieldInputSettings,
  preserve,
  dependencies,
  rules,
  extra,
  source,
  children,
}: Props) {
  const form = TltForm.useFormInstance();
  const input = getHeatCalcFieldInputConfig(id, objectType);
  const watchedRequired = TltForm.useWatch(
    (values: Record<string, unknown>) => isHeatCalcFieldRequired(id, { objectType, values }),
    form,
  );
  const required = watchedRequired ?? heatCalcFieldRequired(form, objectType, id);
  const fieldSource = resolveFieldSource({
    inputType: input?.type,
    required,
    source,
  });
  const fieldExtra = fieldSource || extra != null
    ? <FieldSourceExtra source={fieldSource}>{extra}</FieldSourceExtra>
    : undefined;

  const control = children ?? (
    <UnitInputNumber
      data-testid={testId}
      {...heatCalcNumberInputProps(objectType, id, { fieldInputSettings, form })}
      unit={input?.unit ?? ''}
    />
  );

  return (
    <TltForm.Item
      className={`${className}${fieldSource ? ' field-source-form-item' : ''}`}
      label={
        <FieldLabel
          text={getHeatCalcFieldLabel(id, { context: 'form', objectType })}
        />
      }
      name={name ?? id}
      preserve={preserve}
      dependencies={dependencies}
      extra={fieldExtra}
      rules={rules ?? heatCalcFormFieldRules(form, objectType, id)}
    >
      <HelpedControl hint={getHeatCalcFieldDescription(id, { objectType })}>
        {control}
      </HelpedControl>
    </TltForm.Item>
  );
}
