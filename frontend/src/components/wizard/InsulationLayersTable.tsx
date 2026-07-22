/**
 * ============================================================================
 * PROTECTED COMPONENT — InsulationLayersTable
 * ============================================================================
 *
 * Таблица слоёв изоляции (шапка + строки 1..3):
 *   Слой | Материал изоляции | Толщина | λ слоя | Диапазон температур
 *
 * Variant D — layer count via table:
 *   • «+» in header column «Слой» — add outer layer (max 3)
 *   • «−» on active row — remove this layer and outer ones (min 1)
 *   Source of truth: form field insulation_layer_count (hidden)
 *
 * Layout: .insulation-layer-cell--{index|material|thickness|lambda|range}
 * CSS: insulation-layers-table.css
 * ============================================================================
 */

import {
  useEffect,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Form } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import './insulation-layers-table.css';
import {
  heatCalcCustomControlRequiredProps,
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import { applyHeatCalcFieldValue } from '@/domain/heatCalcFieldRules';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import InsulationConductivityField from './InsulationConductivityField';
import InsulationTemperatureRangeField from './InsulationTemperatureRangeField';
import ReferencePicker, { type ReferencePickerOption } from './ReferencePicker';
import ThermalStep from './steps/ThermalStep';

const MIN_LAYERS = 1;
const MAX_LAYERS = 3;

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType) {
  return getHeatCalcFieldDescription(fieldId, { objectType });
}

function normalizeLayerCount(value: unknown): number {
  const n = Number(value ?? MIN_LAYERS);
  if (!Number.isFinite(n)) return MIN_LAYERS;
  return Math.min(MAX_LAYERS, Math.max(MIN_LAYERS, Math.trunc(n)));
}

function Cell({
  role,
  children,
}: {
  role: 'index' | 'material' | 'thickness' | 'lambda' | 'range';
  children: ReactNode;
}) {
  return (
    <div className={`insulation-layer-cell insulation-layer-cell--${role}`} data-ins-cell={role}>
      {children}
    </div>
  );
}

export interface InsulationLayersTableProps {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  layerCount: number;
  insulationMaterials: InsulationEntry[];
  insulationMaterialOptions: ReferencePickerOption[];
  insulationMaterialsError: boolean;
  isInsulationMaterialsFetching: boolean;
  secondInsulationMaterial?: string;
  thirdInsulationMaterial?: string;
  selectedSecondInsulation?: InsulationEntry;
  selectedThirdInsulation?: InsulationEntry;
  onProgrammaticValuesChange: (changedValues: Record<string, unknown>) => void;
}

export default function InsulationLayersTable({
  objectType,
  fieldInputSettings,
  layerCount: layerCountProp,
  insulationMaterials,
  insulationMaterialOptions,
  insulationMaterialsError,
  isInsulationMaterialsFetching,
  secondInsulationMaterial,
  thirdInsulationMaterial,
  selectedSecondInsulation,
  selectedThirdInsulation,
  onProgrammaticValuesChange,
}: InsulationLayersTableProps) {
  const form = Form.useFormInstance();
  const watchedCount = Form.useWatch('insulation_layer_count', form);
  const layerCount = normalizeLayerCount(watchedCount ?? layerCountProp);
  const [activeLayer, setActiveLayer] = useState(1);

  useEffect(() => {
    setActiveLayer((prev) => Math.min(Math.max(prev, MIN_LAYERS), layerCount));
  }, [layerCount]);

  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });

  function setLayerCount(next: number) {
    const clamped = normalizeLayerCount(next);
    if (clamped === layerCount) return;
    const currentValues = form.getFieldsValue(true) as Record<string, unknown>;
    const nextValues = applyHeatCalcFieldValue('insulation_layer_count', String(clamped), {
      objectType,
      values: currentValues,
    });
    form.setFieldsValue(nextValues);
    // Передаём ТОЛЬКО реальную дельту, а не весь набор значений формы.
    // Иначе λ/min/max существующих слоёв попадают в «changed», и обработчик
    // в ObjectWizard принимает это за ручное редактирование λ, сбрасывая
    // материалы слоёв в «Другое» (other) при добавлении слоя.
    const changedDelta: Record<string, unknown> = {
      insulation_layer_count: nextValues.insulation_layer_count,
    };
    Object.keys(currentValues).forEach((key) => {
      if (!(key in nextValues)) changedDelta[key] = undefined;
    });
    onProgrammaticValuesChange(changedDelta);
  }

  function handleAddLayer(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (layerCount >= MAX_LAYERS) return;
    const next = layerCount + 1;
    setLayerCount(next);
    setActiveLayer(next);
  }

  function handleRemoveActiveLayer(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (layerCount <= MIN_LAYERS || activeLayer < 2) return;
    // Remove active layer and all outer ones: new count = activeLayer - 1
    const next = Math.max(MIN_LAYERS, activeLayer - 1);
    setLayerCount(next);
    setActiveLayer(next);
  }

  const canAdd = layerCount < MAX_LAYERS;
  const canRemove = layerCount > MIN_LAYERS && activeLayer >= 2;

  function renderIndexCell(layer: number) {
    const isActive = activeLayer === layer;
    return (
      <Cell role="index">
        <div className="insulation-layer-index-wrap">
          <span className="insulation-layer-index" aria-hidden="true">{layer}</span>
          {isActive && canRemove ? (
            <button
              type="button"
              className="insulation-layer-remove-btn"
              data-testid={`insulation-layer-remove-${layer}`}
              aria-label={`Удалить слой ${layer} и внешние`}
              title="Удалить этот слой и внешние"
              onClick={handleRemoveActiveLayer}
            >
              <MinusOutlined />
            </button>
          ) : null}
        </div>
      </Cell>
    );
  }

  return (
    <div
      className="insulation-layers-table"
      data-testid="insulation-layers-table"
      data-protected="insulation-layers-table"
      data-wizard-island="insulation-layers-table"
      data-layer-count={layerCount}
    >
      {/* Keep form field for validation/submit; UX is table +/− */}
      <Form.Item name="insulation_layer_count" noStyle>
        <input type="hidden" data-testid="insulation-layer-count-value" readOnly />
      </Form.Item>

      <div className="insulation-layers-header">
        <span className="insulation-layers-header__index">
          <span className="insulation-layers-header__index-label">Слой</span>
          <button
            type="button"
            className="insulation-layer-add-btn"
            data-testid="insulation-layer-add"
            aria-label={canAdd ? 'Добавить слой изоляции' : 'Достигнут максимум слоёв (3)'}
            title={canAdd ? 'Добавить слой' : 'Максимум 3 слоя'}
            disabled={!canAdd}
            onClick={handleAddLayer}
          >
            <PlusOutlined />
          </button>
        </span>
        <span className="insulation-layers-header__material">Материал изоляции</span>
        <span className="insulation-layers-header__thickness">Толщина</span>
        <span className="insulation-layers-header__lambda">λ слоя</span>
        <span className="insulation-layers-header__range">Диапазон температур</span>
      </div>

      <div className={`insulation-layers-grid insulation-layers-grid--${layerCount}`}>
        <div
          className={`insulation-layer-group${activeLayer === 1 ? ' insulation-layer-group--active' : ''}`}
          data-layer="1"
          data-active={activeLayer === 1 ? 'true' : 'false'}
          onClick={() => setActiveLayer(1)}
          onFocusCapture={() => setActiveLayer(1)}
        >
          {renderIndexCell(1)}
          <ThermalStep
            tableCells
            objectType={objectType}
            fieldInputSettings={fieldInputSettings}
            insulationMaterials={insulationMaterials}
            onProgrammaticValuesChange={onProgrammaticValuesChange}
            insulationMaterialOptions={insulationMaterialOptions}
            insulationMaterialsError={insulationMaterialsError}
            isInsulationMaterialsFetching={isInsulationMaterialsFetching}
          />
        </div>

        {layerCount >= 2 && (
          <div
            className={`insulation-layer-group${activeLayer === 2 ? ' insulation-layer-group--active' : ''}`}
            data-layer="2"
            data-active={activeLayer === 2 ? 'true' : 'false'}
            onClick={() => setActiveLayer(2)}
            onFocusCapture={() => setActiveLayer(2)}
          >
            {renderIndexCell(2)}
            <Cell role="material">
              <Form.Item
                className="medium-select-form-item layer-material-form-item second-layer-material-form-item helped-form-item"
                label={fieldLabel('second_insulation_material', objectType)}
                name="second_insulation_material"
                preserve={false}
                rules={heatCalcFormFieldRules(form, objectType, 'second_insulation_material')}
              >
                {withHelp(
                  <ReferencePicker
                    data-testid="second-insulation-material-select"
                    options={insulationMaterialOptions}
                    placeholder="Выберите материал"
                    modalTitle="Материал 2-го слоя"
                    searchPlaceholder="Поиск материала"
                    loading={isInsulationMaterialsFetching}
                    notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                    {...heatCalcCustomControlRequiredProps(form, objectType, 'second_insulation_material')}
                  />,
                  fieldHelp('second_insulation_material', objectType),
                )}
              </Form.Item>
            </Cell>
            <Cell role="thickness">
              <Form.Item
                className="numeric-form-item short-number-form-item second-layer-thickness-form-item helped-form-item"
                label={fieldLabel('second_insulation_thickness_mm', objectType)}
                name="second_insulation_thickness_mm"
                preserve={false}
                rules={heatCalcFormFieldRules(form, objectType, 'second_insulation_thickness_mm')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="second-insulation-thickness-input"
                    {...numberInputProps('second_insulation_thickness_mm')}
                    unit="мм"
                  />,
                  fieldHelp('second_insulation_thickness_mm', objectType),
                )}
              </Form.Item>
            </Cell>
            <Cell role="lambda">
              <InsulationConductivityField
                material={secondInsulationMaterial}
                selectedMaterial={selectedSecondInsulation}
                name="second_insulation_lambda"
                dataTestIdPrefix="second-insulation"
                objectType={objectType}
                fieldInputSettings={fieldInputSettings}
                labelFieldId="second_insulation_lambda"
              />
            </Cell>
            <Cell role="range">
              <InsulationTemperatureRangeField
                material={secondInsulationMaterial}
                selectedMaterial={selectedSecondInsulation}
                minName="second_insulation_temperature_min"
                maxName="second_insulation_temperature_max"
                dataTestIdPrefix="second-insulation"
                objectType={objectType}
                labelFieldId="second_insulation_temperature_range"
                hint={fieldHelp('second_insulation_temperature_range', objectType)}
                required={heatCalcCustomControlRequiredProps(form, objectType, 'second_insulation_temperature_range').required}
                onRangeChange={onProgrammaticValuesChange}
              />
            </Cell>
          </div>
        )}

        {layerCount >= 3 && (
          <div
            className={`insulation-layer-group${activeLayer === 3 ? ' insulation-layer-group--active' : ''}`}
            data-layer="3"
            data-active={activeLayer === 3 ? 'true' : 'false'}
            onClick={() => setActiveLayer(3)}
            onFocusCapture={() => setActiveLayer(3)}
          >
            {renderIndexCell(3)}
            <Cell role="material">
              <Form.Item
                className="medium-select-form-item layer-material-form-item third-layer-material-form-item helped-form-item"
                label={fieldLabel('third_insulation_material', objectType)}
                name="third_insulation_material"
                preserve={false}
                rules={heatCalcFormFieldRules(form, objectType, 'third_insulation_material')}
              >
                {withHelp(
                  <ReferencePicker
                    data-testid="third-insulation-material-select"
                    options={insulationMaterialOptions}
                    placeholder="Выберите материал"
                    modalTitle="Материал 3-го слоя"
                    searchPlaceholder="Поиск материала"
                    loading={isInsulationMaterialsFetching}
                    notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                    {...heatCalcCustomControlRequiredProps(form, objectType, 'third_insulation_material')}
                  />,
                  fieldHelp('third_insulation_material', objectType),
                )}
              </Form.Item>
            </Cell>
            <Cell role="thickness">
              <Form.Item
                className="numeric-form-item short-number-form-item third-layer-thickness-form-item helped-form-item"
                label={fieldLabel('third_insulation_thickness_mm', objectType)}
                name="third_insulation_thickness_mm"
                preserve={false}
                rules={heatCalcFormFieldRules(form, objectType, 'third_insulation_thickness_mm')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="third-insulation-thickness-input"
                    {...numberInputProps('third_insulation_thickness_mm')}
                    unit="мм"
                  />,
                  fieldHelp('third_insulation_thickness_mm', objectType),
                )}
              </Form.Item>
            </Cell>
            <Cell role="lambda">
              <InsulationConductivityField
                material={thirdInsulationMaterial}
                selectedMaterial={selectedThirdInsulation}
                name="third_insulation_lambda"
                dataTestIdPrefix="third-insulation"
                objectType={objectType}
                fieldInputSettings={fieldInputSettings}
                labelFieldId="third_insulation_lambda"
              />
            </Cell>
            <Cell role="range">
              <InsulationTemperatureRangeField
                material={thirdInsulationMaterial}
                selectedMaterial={selectedThirdInsulation}
                minName="third_insulation_temperature_min"
                maxName="third_insulation_temperature_max"
                dataTestIdPrefix="third-insulation"
                objectType={objectType}
                labelFieldId="third_insulation_temperature_range"
                hint={fieldHelp('third_insulation_temperature_range', objectType)}
                required={heatCalcCustomControlRequiredProps(form, objectType, 'third_insulation_temperature_range').required}
                onRangeChange={onProgrammaticValuesChange}
              />
            </Cell>
          </div>
        )}
      </div>
    </div>
  );
}
