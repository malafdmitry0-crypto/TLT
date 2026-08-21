/**
 * ============================================================================
 * PROTECTED COMPONENT — HeatCalcObjectFieldsPanel
 * ============================================================================
 *
 * Верхний блок полей теплорасчёта:
 *   • геометрия / материал / локальные элементы
 *   • размещение / климат / температуры
 *   • settings: кол-во слоёв + режим tm
 *
 * ⛔ МЕНЯТЬ ТОЛЬКО ПО ЖЁСТКОМУ ПРЯМОМУ ЗАПРОСУ.
 *    Не править «заодно» при dual-form densify, cable-panel, typography
 *    соседних блоков. Не трогать InsulationLayersTable из этого файла.
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 1 — HORIZONTAL FIELD ROW (эталон: CableAlgorithmPanel)
 * ════════════════════════════════════════════════════════════════════
 *    Каждое видимое поле — ОДНА горизонтальная строка:
 *
 *        [ label слева ]  [ control справа ]
 *
 *    Как «Температура пропарки | [____] °C» на правой форме.
 *    Запрещено: label НАД control (vertical Form layout) как default.
 *    Label может быть 1–2 строки текста, но блок label остаётся СЛЕВА.
 *    CSS: UI kit adapter `.tlt-compact-field-grid--ant-form .ant-form-item-row`
 *         → `grid-template-columns: var(--tlt-compact-label-width)
 *            var(--tlt-compact-control-width)` (ui-kit/compact-fields.css).
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 2 — UNIFIED TYPE SCALE (эталон: Алгоритм выбора кабеля)
 * ════════════════════════════════════════════════════════════════════
 *    Значения — из кадров mockups/html/* («HTML — источник правды», владелец):
 *      label:   9px / 600 / #26364a, колонки 118px (текст) и 132px (числа)
 *      control: 36px / radius 6px, значение 12px, контрол текучий (1fr)
 *    Задаёт остров heat-object-fields.css; :root не трогать — те же токены
 *    питают электрорасчёт и спецификацию. --dual-form-* — алиасы.
 *    Это описание ТЕКУЩЕГО контракта, не запрет на изменение: при расхождении
 *    с кадром прав кадр, а шапка обновляется вместе со стилем.
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 3 — CONTENT-SIZED CONTROLS
 * ════════════════════════════════════════════════════════════════════
 *    Ширина CONTROL ≈ longest realistic value + chrome: пофилдовые
 *    --tlt-compact-control-width в heat-object-fields.css (значения —
 *    :root --tlt-field-ctrl-*). Не растягивать form-item на 1fr «для красоты».
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 4 — ДВА БЛОКА ПО МАКЕТУ (wide)
 * ════════════════════════════════════════════════════════════════════
 *    Кадр `mockups/html/ishodnye-truba-zapolneno.html`:
 *      блок 1 — текст и селекты, 2 колонки, заполнение построчно;
 *      блок 2 — числовые, 3 колонки, построчно;
 *      ниже — таблица слоёв на всю ширину панели.
 *    Порядок полей внутри блоков задаёт кадр и собирает
 *    ObjectWizardFormSlots.tsx; здесь только границы блоков.
 *    Боковая раскладка (side) остаётся на трёх слотах — её кадра нет.
 *
 *    CSS: heat-object-fields.css only.
 *
 * Границы:
 *   ✅ этот компонент + CSS scoped на `.heat-object-fields`
 *   ⛔ `.insulation-layers-table` / InsulationLayersTable.tsx
 *   ⛔ CableAlgorithmPanel (эталон horizontal row — не ломать)
 *
 * Слоты (composition) — содержимое полей приходит снаружи из ObjectWizard,
 * layout/DOM-границы живут здесь.
 * ============================================================================
 */

import type { ReactNode } from 'react';
import { CompactFieldGrid } from '@/components/ui-kit';
import type { HeatCalcObjectType } from '@/types/project';
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
/** CSS island — only styles under .heat-object-fields (see WIZARD-CSS-ISLANDS.md) */
import './heat-object-fields.css';
import './heat-object-fields-narrow-container.css';

export interface HeatCalcObjectFieldsPanelProps {
  layout: ObjectWizardLayoutVariant;
  objectType: HeatCalcObjectType;
  /** wide: text/select group; side: name + geometry */
  geometry: ReactNode;
  /** wide: geometry numeric group; side: climate */
  climate: ReactNode;
  /** wide: environment numeric group; side: insulation settings */
  insulationSettings: ReactNode;
}

export default function HeatCalcObjectFieldsPanel({
  layout,
  objectType,
  geometry,
  climate,
  insulationSettings,
}: HeatCalcObjectFieldsPanelProps) {
  /* wide: горизонтальные строки [label | control]; side: label над контролом */
  const labelPlacement = layout === 'wide' ? 'left' : 'top';
  /* wide: 2 колонки текста и 3 числовых, построчно — как в кадре */
  const wide = layout === 'wide';
  return (
    <div
      className={`heat-object-fields heat-object-fields--${layout}`}
      data-testid="heat-object-fields"
      data-protected="heat-object-fields"
      data-wizard-island="heat-object-fields"
      data-layout={layout}
      data-object-type={objectType}
    >
      <CompactFieldGrid
        className="heat-object-fields__geometry"
        data-slot={layout === 'wide' ? 'wide' : 'geometry'}
        density="compact"
        columns={wide ? 1 : 3}
        flow={wide ? 'rows' : 'columns'}
        maxRowsPerColumn={5}
        antFormAdapter
        labelPlacement={labelPlacement}
      >
        {geometry}
      </CompactFieldGrid>
      <CompactFieldGrid
        className="heat-object-fields__climate"
        data-slot={layout === 'wide' ? 'geometry-numeric' : 'climate'}
        density="compact"
        columns={wide ? 3 : 3}
        flow={wide ? 'rows' : 'columns'}
        maxRowsPerColumn={5}
        antFormAdapter
        labelPlacement={labelPlacement}
      >
        {climate}
      </CompactFieldGrid>
      {insulationSettings ? <CompactFieldGrid
        className="heat-object-fields__settings"
        data-slot={layout === 'wide' ? 'environment-numeric' : 'insulation-settings'}
        density="compact"
        flow="columns"
        maxRowsPerColumn={5}
        antFormAdapter
        labelPlacement={labelPlacement}
      >
        {insulationSettings}
      </CompactFieldGrid> : null}
    </div>
  );
}
