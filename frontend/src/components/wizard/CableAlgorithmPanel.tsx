import { Form } from "antd";
import type { ReactElement } from "react";

import UnitInputNumber from "@/components/common/UnitInputNumber";
/** CSS island — only styles under .object-wizard-cable-panel (see WIZARD-CSS-ISLANDS.md) */
import "./cable-algorithm-panel.css";
import { CompactFieldGrid } from "@/components/ui-kit";
import { TltSelect } from "@/components/form-controls";
import FieldLabel from "@/components/wizard/FieldLabel";
import HelpedControl from "@/components/wizard/HelpedControl";
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from "@/domain/heatCalcFields";
import type { HeatCalcObjectType } from "@/types/project";
import type { HeatCalcFieldInputSettings } from "@/utils/heatCalcFieldInputSettings";
import { TltNumberField, TltTextField } from "@/components/ui-kit";
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
} from "@/utils/heatCalcWizardFieldRules";

/**
 * ⛔ HARD RULE — HORIZONTAL FIELD ROW (эталон dual-form)
 * Каждое поле: [ label слева | control справа ] в одну строку.
 * HeatCalcObjectFieldsPanel обязан совпадать с этим паттерном.
 * Не переводить cable-поля на vertical label→control.
 */
/** TNP «Список переменных» — схемы соединения (алгоритм выбора кабеля). */
export const CABLE_CONNECTION_SCHEME_OPTIONS = [
  { value: "line", label: "Линия" },
  { value: "loop", label: "Петля" },
  { value: "star", label: "Звезда" },
  { value: "two_loops", label: "Две петли" },
  { value: "two_stars", label: "Две звезды" },
  { value: "three_loops", label: "Три петли" },
  { value: "three_stars", label: "Три звезды" },
] as const;

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return (
    <FieldLabel
      text={getHeatCalcFieldLabel(fieldId, { context: "form", objectType })}
    />
  );
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType) {
  return getHeatCalcFieldDescription(fieldId, { objectType });
}

export interface CableAlgorithmPanelProps {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

/**
 * Правая форма HeatCalc: «Алгоритм выбора кабеля» (оранжевый блок ТНП).
 * Живёт внутри Form ObjectWizard; пишет в existing object.params keys.
 * Backend formula/validation follow-up — отдельная задача.
 */
export default function CableAlgorithmPanel({
  objectType,
  fieldInputSettings,
}: CableAlgorithmPanelProps) {
  const form = Form.useFormInstance();

  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, {
      fieldInputSettings,
      form,
    });

  return (
    <div
      className="object-wizard-cable-panel cable-island"
      data-panel="cable-algorithm"
      data-testid="heat-cable-algorithm-form"
      data-protected="heat-cable-algorithm"
      data-wizard-island="cable-algorithm"
    >
      <h4 className="inline-form-section-banner inline-form-section-banner--cable">
        <span>Алгоритм выбора кабеля</span>
      </h4>
      <div className="cable-algorithm-grid" data-layout="cable-algorithm">
        <CompactFieldGrid
          className="cable-algorithm-fields"
          columns={2}
          flow="rows"
          maxRowsPerColumn={4}
          antFormAdapter
          labelPlacement="left"
        >
          {/* 8. connection_type / схема соединения */}
          <Form.Item
            className="cable-algorithm-field connection-type-form-item"
            label={<FieldLabel text="Схема соединения" />}
            name="connection_type"
          >
            {withHelp(
              <TltSelect
                data-testid="connection-type-select"
                options={[...CABLE_CONNECTION_SCHEME_OPTIONS]}
                allowClear
                placeholder="Выберите схему"
              />,
              "Схема соединения нагревательной секции (ТНП: петля / линия / звезда / …).",
            )}
          </Form.Item>

          {/* 1. vapor_temperature */}
          <Form.Item
            className="cable-algorithm-field vapor-temperature-form-item cable-algorithm-field--unit helped-form-item"
            label={fieldLabel("vapor_temperature", objectType)}
            name="vapor_temperature"
            rules={heatCalcFormFieldRules(
              form,
              objectType,
              "vapor_temperature",
            )}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="vapor-temperature-input"
                {...numberInputProps("vapor_temperature")}
                unit="°C"
              />,
              fieldHelp("vapor_temperature", objectType),
            )}
          </Form.Item>

          {/* 5. environment */}
          <Form.Item
            className="cable-algorithm-field environment-form-item helped-form-item"
            label={fieldLabel("environment", objectType)}
            name="environment"
            rules={heatCalcFormFieldRules(form, objectType, "environment")}
          >
            {withHelp(
              <TltSelect
                data-testid="environment-select"
                options={heatCalcSelectOptions(objectType, "environment")}
              />,
              fieldHelp("environment", objectType),
            )}
          </Form.Item>

          {/* 7. min_switch_temperature */}
          <Form.Item
            className="cable-algorithm-field min-switch-temperature-form-item cable-algorithm-field--unit helped-form-item"
            label={fieldLabel("min_switch_temperature", objectType)}
            name="min_switch_temperature"
            rules={heatCalcFormFieldRules(
              form,
              objectType,
              "min_switch_temperature",
            )}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="min-switch-temperature-input"
                {...numberInputProps("min_switch_temperature")}
                unit="°C"
              />,
              fieldHelp("min_switch_temperature", objectType),
            )}
          </Form.Item>

          {/* 2. safety_factor K */}
          <Form.Item
            className="cable-algorithm-field safety-factor-form-item helped-form-item"
            label={fieldLabel("safety_factor", objectType)}
            name="safety_factor"
            rules={heatCalcFormFieldRules(form, objectType, "safety_factor")}
          >
            {withHelp(
              <TltNumberField
                data-testid="safety-factor-input"
                {...numberInputProps("safety_factor")}
                className="cable-algorithm-number"
              />,
              fieldHelp("safety_factor", objectType),
            )}
          </Form.Item>

          {/* 3. supply_voltage U */}
          <Form.Item
            className="cable-algorithm-field supply-voltage-form-item helped-form-item"
            label={fieldLabel("supply_voltage", objectType)}
            name="supply_voltage"
            rules={heatCalcFormFieldRules(form, objectType, "supply_voltage")}
          >
            {withHelp(
              <TltSelect
                data-testid="supply-voltage-select"
                options={heatCalcSelectOptions(objectType, "supply_voltage")}
              />,
              fieldHelp("supply_voltage", objectType),
            )}
          </Form.Item>

          {/* 4. winding_coefficient w */}
          <Form.Item
            className="cable-algorithm-field winding-coefficient-form-item helped-form-item"
            label={fieldLabel("winding_coefficient", objectType)}
            name="winding_coefficient"
            rules={heatCalcFormFieldRules(
              form,
              objectType,
              "winding_coefficient",
            )}
          >
            {withHelp(
              <TltNumberField
                data-testid="winding-coefficient-input"
                {...numberInputProps("winding_coefficient")}
                className="cable-algorithm-number"
              />,
              fieldHelp("winding_coefficient", objectType),
            )}
          </Form.Item>

          {/* 6. temperature_group T1…T6 */}
          <Form.Item
            className="cable-algorithm-field temperature-group-form-item helped-form-item"
            label={fieldLabel("temperature_group", objectType)}
            name="temperature_group"
            rules={heatCalcFormFieldRules(
              form,
              objectType,
              "temperature_group",
            )}
          >
            {withHelp(
              <TltSelect
                data-testid="temperature-group-select"
                options={heatCalcSelectOptions(objectType, "temperature_group")}
              />,
              fieldHelp("temperature_group", objectType),
            )}
          </Form.Item>
        </CompactFieldGrid>
      </div>
      {/* Round-trip for steam_tracing (yes/no) — not part of the 8 TNP orange fields;
          vapor_temperature is the visible пропарки input. */}
      <Form.Item name="steam_tracing" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
      <Form.Item name="zone_classification" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
    </div>
  );
}
