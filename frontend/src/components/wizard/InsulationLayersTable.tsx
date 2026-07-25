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
} from 'react';
import { Form } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import './insulation-layers-table.css';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import { applyHeatCalcFieldValue } from '@/domain/heatCalcFieldRules';
import type { ReferencePickerOption } from './ReferencePicker';
import ThermalStep from './steps/ThermalStep';
import {
  InsulationOuterLayerRow,
  SECOND_INSULATION_LAYER,
  THIRD_INSULATION_LAYER,
} from './InsulationOuterLayerRow';

const MIN_LAYERS = 1;
const MAX_LAYERS = 3;

function normalizeLayerCount(value: unknown): number {
  const n = Number(value ?? MIN_LAYERS);
  if (!Number.isFinite(n)) return MIN_LAYERS;
  return Math.min(MAX_LAYERS, Math.max(MIN_LAYERS, Math.trunc(n)));
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
      <div className="insulation-layer-cell insulation-layer-cell--index" data-ins-cell="index">
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
      </div>
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
          <InsulationOuterLayerRow
            config={SECOND_INSULATION_LAYER}
            form={form}
            objectType={objectType}
            fieldInputSettings={fieldInputSettings}
            insulationMaterialOptions={insulationMaterialOptions}
            insulationMaterialsError={insulationMaterialsError}
            isInsulationMaterialsFetching={isInsulationMaterialsFetching}
            material={secondInsulationMaterial}
            selectedMaterial={selectedSecondInsulation}
            indexCell={renderIndexCell(2)}
            active={activeLayer === 2}
            onActivate={() => setActiveLayer(2)}
            onProgrammaticValuesChange={onProgrammaticValuesChange}
          />
        )}

        {layerCount >= 3 && (
          <InsulationOuterLayerRow
            config={THIRD_INSULATION_LAYER}
            form={form}
            objectType={objectType}
            fieldInputSettings={fieldInputSettings}
            insulationMaterialOptions={insulationMaterialOptions}
            insulationMaterialsError={insulationMaterialsError}
            isInsulationMaterialsFetching={isInsulationMaterialsFetching}
            material={thirdInsulationMaterial}
            selectedMaterial={selectedThirdInsulation}
            indexCell={renderIndexCell(3)}
            active={activeLayer === 3}
            onActivate={() => setActiveLayer(3)}
            onProgrammaticValuesChange={onProgrammaticValuesChange}
          />
        )}
      </div>
    </div>
  );
}
